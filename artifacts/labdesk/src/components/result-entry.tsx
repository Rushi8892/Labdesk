import { useMemo, useState } from 'react';
import type { LabResult, ResultInput } from '@workspace/api-client-react';
import { Field, Pill } from '@/components/kit';
import { useLab, useOperator } from '@/hooks/use-lab';
import type { Idx, VState } from '@/lib/lab';
import { applicable, blankV, evaluate, flagLabel, flagTone, indexCatalog, fmtDate, msg, statusTone, validateValue } from '@/lib/lab';

export function ResultEntry({ result, ix: liveIx, onSaved }: { result?: LabResult; ix: Idx; onSaved: (id: number) => void }) {
  const lab = useLab();
  const op = useOperator();
  const cfg = result?.configuration;
  const ix = useMemo(
    () => (cfg ? indexCatalog({ tests: [cfg.test], parameters: cfg.parameters, options: cfg.options, references: cfg.references, categories: [], specimens: [], methods: [] }) : liveIx),
    [cfg, liveIx],
  );
  const locked = !!result && result.status !== 'Draft';
  const [h, setH] = useState({
    testId: result ? String(result.testId) : '', patientCode: result?.patientCode ?? '', patientName: result?.patientName ?? '',
    age: result ? String(result.age) : '', sex: (result?.sex ?? 'Male') as string, context: result?.context ?? '',
    collectedAt: (result?.collectedAt ?? '').slice(0, 16), comment: result?.comment ?? '',
  });
  const [vals, setVals] = useState<Record<number, VState>>(() => {
    const m: Record<number, VState> = {};
    result?.values.forEach((v) => { m[v.parameterId] = { value: v.value, disposition: v.disposition, skipReason: v.skipReason ?? '', skipApprovedBy: v.skipApprovedBy ?? '', comment: v.comment }; });
    return m;
  });
  const [actor, setActor] = useState(op);
  const [errs, setErrs] = useState<string[]>([]);
  const [showVal, setShowVal] = useState(false);
  const setHF = (k: keyof typeof h, v: string) => setH((p) => ({ ...p, [k]: v }));

  const tid = Number(h.testId);
  const test = ix.testById.get(tid);
  const params = useMemo(() => (ix.paramsByTest.get(tid) ?? []).filter((p) => p.active || result?.values.some((v) => v.parameterId === p.id)), [ix, tid, result]);
  const contexts = useMemo(() => Array.from(new Set(ix.raw.references.map((r) => r.context))).filter(Boolean), [ix]);
  const age = h.age.trim() === '' ? null : Number(h.age);
  const getV = (id: number) => vals[id] ?? blankV();
  const setV = (id: number, patch: Partial<VState>) => setVals((p) => ({ ...p, [id]: { ...(p[id] ?? blankV()), ...patch } }));

  const rows = params.map((p) => {
    const v = getV(p.id as number);
    const opts = ix.optsByParam.get(p.id as number) ?? [];
    const matches = applicable(p, ix.refsByParam.get(p.id as number) ?? [], { age, sex: h.sex, context: h.context, collectedAt: h.collectedAt });
    const sv = locked ? result?.values.find((x) => x.parameterId === p.id) : undefined;
    const live = evaluate(p, v.disposition === 'Completed' ? v.value : '', matches, opts);
    const ev = sv ? { state: (sv.referenceText ? 'single' : 'none') as 'single' | 'none', text: sv.referenceText || 'Not configured', flag: sv.flag ?? '', referenceId: sv.referenceId ?? null } : live;
    return { p, v, opts, ev, err: validateValue(p, v, opts) };
  });

  const headerErrors = () => {
    const e: string[] = [];
    if (!test) e.push('Choose a test');
    if (!h.patientCode.trim()) e.push('Patient code is required');
    if (!h.patientName.trim()) e.push('Patient name is required');
    if (age === null || Number.isNaN(age) || age < 0) e.push('Age in years must be 0 or more');
    if (!h.context.trim()) e.push('Context is required');
    if (!h.collectedAt) e.push('Collected date is required');
    return e;
  };

  const payload = (): ResultInput => ({
    id: result?.id, testId: tid, patientCode: h.patientCode.trim(), patientName: h.patientName.trim(), age: age as number,
    sex: h.sex as ResultInput['sex'], context: h.context.trim(), collectedAt: h.collectedAt, comment: h.comment,
    values: rows.map(({ p, v, ev }) => ({
      parameterId: p.id as number, value: v.disposition === 'Not Done' ? '' : v.value.trim(), disposition: v.disposition,
      skipReason: v.disposition === 'Not Done' ? v.skipReason.trim() : '', skipApprovedBy: v.disposition === 'Not Done' ? v.skipApprovedBy.trim() : '',
      comment: v.comment, flag: ev.flag, referenceText: ev.state === 'single' ? ev.text : '', referenceId: ev.referenceId,
    })),
  });

  const save = async (): Promise<LabResult | null> => {
    const e = headerErrors();
    setErrs(e);
    if (e.length) return null;
    try {
      const r = await lab.saveResult.mutateAsync({ data: payload() });
      return r;
    } catch (x) { setErrs([msg(x)]); return null; }
  };

  const saveDraft = async () => {
    const r = await save();
    if (r) { lab.toast({ title: 'Draft saved' }); onSaved(r.id); }
  };

  const advance = async () => {
    const next = 'Entered';
    const e = headerErrors();
    rows.forEach((r) => r.err && e.push(`${r.p.name}: ${r.err}`));
    if (actor.trim().length < 2) e.push('Enter the operator name for this transition');
    setShowVal(true);
    setErrs(e);
    if (e.length) return;
    const r = await save();
    if (!r) return;
    try {
      const t = await lab.transition.mutateAsync({ id: r.id, data: { status: next, actor: actor.trim() } });
      lab.toast({ title: `Result ${t.status}` });
      onSaved(t.id);
    } catch (x) { setErrs([msg(x)]); }
  };

  const verifyPersisted = async () => {
    if (!result) return;
    if (actor.trim().length < 2) return setErrs(['Enter the operator name for this transition']);
    try {
      const t = await lab.transition.mutateAsync({ id: result.id, data: { status: 'Verified', actor: actor.trim() } });
      lab.toast({ title: 'Result Verified' });
      onSaved(t.id);
    } catch (x) { setErrs([msg(x)]); }
  };

  const editBackToDraft = async () => {
    if (!result) return;
    const { id, testId, patientName, patientCode, age: a, sex, context, collectedAt, comment, values } = result;
    try {
      const r = await lab.saveResult.mutateAsync({ data: { id, testId, patientName, patientCode, age: a, sex, context, collectedAt, comment, values } });
      lab.toast({ title: 'Returned to Draft for editing' });
      onSaved(r.id);
    } catch (x) { setErrs([msg(x)]); }
  };

  const busy = lab.saveResult.isPending || lab.transition.isPending;
  const next = 'Entered';
  const sexes = ['Male', 'Female', 'Other'];

  return (
    <div className="flex flex-col h-full min-h-0 pop">
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <div className="font-bold text-[15px]">{result ? `Result #${result.id}` : 'New result'}</div>
        {result && <Pill tone={statusTone(result.status)}>{result.status}</Pill>}
        {result?.verifiedBy && <span className="text-xs text-muted-foreground">Verified by {result.verifiedBy}</span>}
        {result?.releasedBy && <span className="text-xs text-muted-foreground">Released by {result.releasedBy} · {fmtDate(result.releasedAt)}</span>}
        {locked && <span className="text-xs ml-auto" style={{ color: 'hsl(var(--warn))' }}>Read only</span>}
      </div>
      <div className="scroll flex-1 px-6 py-4 space-y-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Field label="Test" span={2}>
            <select className="select" disabled={locked || !!result} value={h.testId} onChange={(e) => { setHF('testId', e.target.value); setVals({}); }} data-testid="select-result-test">
              <option value="">Select a test…</option>
              {ix.raw.tests.filter((t) => t.active || t.id === result?.testId).map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select>
          </Field>
          <Field label="Patient code"><input className="input" disabled={locked} value={h.patientCode} onChange={(e) => setHF('patientCode', e.target.value)} data-testid="input-patient-code" /></Field>
          <Field label="Patient name"><input className="input" disabled={locked} value={h.patientName} onChange={(e) => setHF('patientName', e.target.value)} data-testid="input-patient-name" /></Field>
          <Field label="Age (years)"><input className="input" type="number" min={0} disabled={locked} value={h.age} onChange={(e) => setHF('age', e.target.value)} data-testid="input-patient-age" /></Field>
          <Field label="Sex">
            <select className="select" disabled={locked} value={h.sex} onChange={(e) => setHF('sex', e.target.value)} data-testid="select-patient-sex">{sexes.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Context" hint="Selects the reference interval">
            <input className="input" list="result-ctx" disabled={locked} value={h.context} onChange={(e) => setHF('context', e.target.value)} data-testid="input-result-context" />
            <datalist id="result-ctx">{contexts.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Collected at"><input className="input" type="datetime-local" disabled={locked} value={h.collectedAt} onChange={(e) => setHF('collectedAt', e.target.value)} data-testid="input-collected-at" /></Field>
        </div>
        {test?.notes && <div className="text-xs p-2.5 rounded" style={{ background: 'hsl(var(--accent))' }} data-testid="text-test-notes"><b>Test note:</b> {test.notes}</div>}

        {test && rows.length === 0 && <div className="text-xs text-muted-foreground">This test has no active parameters.</div>}
        <div className="space-y-2">
          {rows.map(({ p, v, opts, ev, err }) => {
            const id = p.id as number;
            const nd = v.disposition === 'Not Done';
            const bad = (showVal || v.value || nd) && err;
            return (
              <div key={id} className="panel p-3" data-testid={`param-row-${id}`}>
                <div className="grid gap-3 items-start" style={{ gridTemplateColumns: '1.1fr 1.2fr 1.2fr 130px' }}>
                  <div>
                    <div className="font-semibold">{p.name}{p.required && <span style={{ color: 'hsl(var(--primary))' }}> *</span>}</div>
                    <div className="mono text-muted-foreground">{p.code}{p.unit ? ` · ${p.unit}` : ''}</div>
                    {p.notes && <div className="text-[11px] mt-1 text-muted-foreground" data-testid={`text-param-note-${id}`}>{p.notes}</div>}
                  </div>
                  <div>
                    {nd ? <div className="text-xs text-muted-foreground h-[30px] flex items-center">Not done</div> :
                      p.dataType === 'Dropdown' ? (
                        <select className={`select ${bad ? 'err' : ''}`} disabled={locked} value={v.value} onChange={(e) => setV(id, { value: e.target.value })} data-testid={`input-value-${id}`}>
                          <option value="">{opts.some((o) => o.active) ? 'Select…' : 'No options configured'}</option>
                          {opts.filter((o) => o.active).map((o) => <option key={o.id} value={o.code}>{o.label}</option>)}
                        </select>
                      ) : p.dataType === 'Boolean' ? (
                        <select className={`select ${bad ? 'err' : ''}`} disabled={locked} value={v.value} onChange={(e) => setV(id, { value: e.target.value })} data-testid={`input-value-${id}`}>
                          <option value="">Select…</option><option>Yes</option><option>No</option>
                        </select>
                      ) : (
                        <input className={`input ${bad ? 'err' : ''} ${p.dataType === 'Numeric' ? 'mono' : ''}`} disabled={locked}
                          type={p.dataType === 'Date' ? 'date' : p.dataType === 'Numeric' ? 'number' : 'text'} step={p.dataType === 'Numeric' ? 'any' : undefined}
                          value={v.value} onChange={(e) => setV(id, { value: e.target.value })} data-testid={`input-value-${id}`} />
                      )}
                    {bad && <div className="text-[11px] mt-1" style={{ color: 'hsl(var(--bad))' }} data-testid={`text-error-${id}`}>{err}</div>}
                    {p.dataType === 'Numeric' && !nd && (p.technicalMin !== null || p.technicalMax !== null) && <div className="text-[10.5px] text-muted-foreground mt-1">Technical {p.technicalMin ?? '−∞'} to {p.technicalMax ?? '+∞'}</div>}
                  </div>
                  <div className="text-xs">
                    <div className="lbl">Reference</div>
                    <div className={`mono ${ev.state === 'single' ? '' : 'text-muted-foreground'}`} data-testid={`text-reference-${id}`}>{ev.text}</div>
                  </div>
                  <div className="pt-4">{ev.flag && !nd && <Pill tone={flagTone(ev.flag)}>{flagLabel(ev.flag)}</Pill>}</div>
                </div>
                <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: nd ? '130px 1fr 1fr 1.4fr' : '130px 1fr' }}>
                  <select className="select" disabled={locked} value={v.disposition} onChange={(e) => setV(id, { disposition: e.target.value as VState['disposition'] })} data-testid={`select-disposition-${id}`}>
                    <option>Completed</option><option>Not Done</option>
                  </select>
                  {nd && <input className="input" placeholder="Skip reason" disabled={locked} value={v.skipReason} onChange={(e) => setV(id, { skipReason: e.target.value })} data-testid={`input-skip-reason-${id}`} />}
                  {nd && <input className="input" placeholder="Skip approved by" disabled={locked} value={v.skipApprovedBy} onChange={(e) => setV(id, { skipApprovedBy: e.target.value })} data-testid={`input-skip-approver-${id}`} />}
                  <input className="input" placeholder={nd ? 'Comment (required)' : 'Comment'} disabled={locked} value={v.comment} onChange={(e) => setV(id, { comment: e.target.value })} data-testid={`input-comment-${id}`} />
                </div>
              </div>
            );
          })}
        </div>
        {test && <Field label="Result comment"><textarea className="textarea" disabled={locked} value={h.comment} onChange={(e) => setHF('comment', e.target.value)} data-testid="input-result-comment" /></Field>}
      </div>
      <div className="border-t px-6 py-3 bg-card">
        {errs.length > 0 && (
          <ul className="text-xs mb-2 list-disc pl-4" style={{ color: 'hsl(var(--bad))' }} data-testid="list-validation-errors">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}
        {!locked ? (
          <div className="flex items-center gap-2">
            <button className="btn" disabled={busy || !test} onClick={saveDraft} data-testid="button-save-draft">Save draft</button>
            <div className="ml-auto flex items-center gap-2">
              <input className="input w-48" placeholder="Operator name" value={actor} onChange={(e) => setActor(e.target.value)} data-testid="input-actor" />
              {<button className="btn btn-primary" disabled={busy || !test} onClick={advance} data-testid="button-advance">{busy ? 'Working…' : next === 'Entered' ? 'Save and mark Entered' : 'Save and mark Entered'}</button>}
            </div>
          </div>
        ) : result?.status === 'Entered' ? (
          <div className="flex items-center gap-2">
            <button className="btn" disabled={busy} onClick={editBackToDraft} data-testid="button-edit-draft">Edit (returns to Draft)</button>
            <div className="ml-auto flex items-center gap-2">
              <input className="input w-48" placeholder="Operator name" value={actor} onChange={(e) => setActor(e.target.value)} data-testid="input-actor" />
              <button className="btn btn-primary" disabled={busy} onClick={verifyPersisted} data-testid="button-verify">Verify</button>
            </div>
          </div>
        ) : result?.status === 'Verified' ? (
          <div className="flex items-center gap-2 justify-end">
            <input className="input w-48" placeholder="Operator name" value={actor} onChange={(e) => setActor(e.target.value)} data-testid="input-actor" />
            <button className="btn btn-primary" disabled={busy} onClick={async () => {
              if (actor.trim().length < 2) return setErrs(['Enter the operator name for this transition']);
              try { const t = await lab.transition.mutateAsync({ id: result.id, data: { status: 'Released', actor: actor.trim() } }); lab.toast({ title: 'Result Released' }); onSaved(t.id); } catch (x) { setErrs([msg(x)]); }
            }} data-testid="button-release">Release</button>
          </div>
        ) : <div className="text-xs text-muted-foreground">Released results are final. View the snapshot under Reports.</div>}
      </div>
    </div>
  );
}
