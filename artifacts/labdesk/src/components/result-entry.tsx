import { useMemo, useState } from 'react';
import type { LabResult, ResultInput } from '@workspace/api-client-react';
import { Field, Pill } from '@/components/kit';
import { useLab } from '@/hooks/use-lab';
import type { Idx } from '@/lib/lab';
import { applicable, evaluate, flagLabel, flagTone, indexCatalog, msg, statusTone, validateValue } from '@/lib/lab';

export function ResultEntry({ result, ix: liveIx, onSaved }: { result?: LabResult; ix: Idx; onSaved: (id: number) => void }) {
  const lab = useLab();
  const cfg = result?.configuration;
  const ix = useMemo(
    () => (cfg ? indexCatalog({ tests: [cfg.test], parameters: cfg.parameters, options: cfg.options, references: cfg.references, categories: [], specimens: [], methods: [] }) : liveIx),
    [cfg, liveIx],
  );
  const locked = !!result && result.status === 'Completed';
  const [h, setH] = useState({
    testId: result ? String(result.testId) : '',
    patientName: result?.patientName ?? '',
    age: result ? String(result.age) : '',
    sex: result?.sex ?? 'Male',
    collectedAt: (result?.collectedAt ?? '').slice(0, 16),
  });
  const [vals, setVals] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    result?.values.forEach((v) => { m[v.parameterId] = v.value ?? ''; });
    return m;
  });
  const [errs, setErrs] = useState<string[]>([]);
  const [showVal, setShowVal] = useState(false);
  const setHF = (k: keyof typeof h, v: string) => setH((p) => ({ ...p, [k]: v }));
  const tid = Number(h.testId);
  const test = ix.testById.get(tid);
  const params = useMemo(
    () => (ix.paramsByTest.get(tid) ?? []).filter((p) => p.active || result?.values.some((v) => v.parameterId === p.id)),
    [ix, tid, result],
  );
  const age = h.age.trim() === '' ? null : Number(h.age);
  const rows = params.map((p) => {
    const id = p.id as number;
    const value = vals[id] ?? '';
    const opts = ix.optsByParam.get(id) ?? [];
    const matches = applicable(p, ix.refsByParam.get(id) ?? [], { age, sex: h.sex, collectedAt: h.collectedAt });
    const evaluation = evaluate(p, value, matches, opts);
    const priorValue = locked ? result?.values.find((x) => x.parameterId === id) : undefined;
    const ev = priorValue
      ? { state: (priorValue.referenceText ? 'single' : 'none') as 'single' | 'none', text: priorValue.referenceText || 'Not configured', flag: priorValue.flag ?? '', referenceId: priorValue.referenceId ?? null }
      : evaluation;
    return { p, id, value, opts, ev, err: validateValue(p, value, opts) };
  });

  const headerErrors = () => {
    const e: string[] = [];
    if (!test) e.push('Choose a test');
    if (!h.patientName.trim()) e.push('Patient name is required');
    if (age === null || Number.isNaN(age) || age < 0) e.push('Age in years must be 0 or more');
    if (!h.collectedAt) e.push('Collected date is required');
    return e;
  };

  const payload = (complete: boolean): ResultInput => ({
    id: result?.id,
    testId: tid,
    patientName: h.patientName.trim(),
    age: age as number,
    sex: h.sex as ResultInput['sex'],
    collectedAt: h.collectedAt,
    complete,
    values: rows.map(({ p, value }) => ({ parameterId: p.id as number, value: value.trim() })),
  });

  const save = async (complete: boolean) => {
    const e = headerErrors();
    if (complete) {
      rows.forEach((r) => {
        if (r.err) e.push(`${r.p.name}: ${r.err}`);
        if (r.p.required && !r.value.trim() && !r.err) e.push(`${r.p.name}: Required`);
      });
    }
    setShowVal(complete);
    setErrs(e);
    if (e.length) return;
    try {
      const saved = await lab.saveResult.mutateAsync({ data: payload(complete) });
      lab.toast({ title: complete ? 'Result completed' : 'Draft saved' });
      onSaved(saved.id);
    } catch (error) {
      setErrs([msg(error)]);
    }
  };

  const busy = lab.saveResult.isPending;
  const sexes = ['Male', 'Female', 'Other'];
  return (
    <div className="flex flex-col h-full min-h-0 pop">
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <div className="font-bold text-[15px]">{result ? `Result #${result.id}` : 'New result'}</div>
        {result && <Pill tone={statusTone(result.status)}>{result.status}</Pill>}
        {locked && <span className="text-xs ml-auto" style={{ color: 'hsl(var(--warn))' }}>Completed · read only</span>}
      </div>
      <div className="scroll flex-1 px-6 py-4 space-y-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Field label="Test" span={2}>
            <select className="select" disabled={locked || !!result} value={h.testId} onChange={(e) => { setHF('testId', e.target.value); setVals({}); }} data-testid="select-result-test">
              <option value="">Select a test…</option>
              {ix.raw.tests.filter((t) => t.active || t.id === result?.testId).map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </select>
          </Field>
          <Field label="Patient name"><input className="input" disabled={locked} value={h.patientName} onChange={(e) => setHF('patientName', e.target.value)} data-testid="input-patient-name" /></Field>
          <Field label="Age (years)"><input className="input" type="number" min={0} disabled={locked} value={h.age} onChange={(e) => setHF('age', e.target.value)} data-testid="input-patient-age" /></Field>
          <Field label="Sex">
            <select className="select" disabled={locked} value={h.sex} onChange={(e) => setHF('sex', e.target.value)} data-testid="select-patient-sex">{sexes.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Collected at"><input className="input" type="datetime-local" disabled={locked} value={h.collectedAt} onChange={(e) => setHF('collectedAt', e.target.value)} data-testid="input-collected-at" /></Field>
        </div>
        {test && params.length === 0 && <div className="text-xs text-muted-foreground">This test has no active parameters.</div>}
        <div className="space-y-2">
          {rows.map(({ p, id, value, opts, ev, err }) => {
            const bad = (showVal || value) && err;
            return (
              <div key={id} className="panel p-3" data-testid={`param-row-${id}`}>
                <div className="grid gap-3 items-center" style={{ gridTemplateColumns: '1.1fr 1.2fr 1.2fr 130px' }}>
                  <div>
                    <div className="font-semibold">{p.name}{p.required && <span style={{ color: 'hsl(var(--primary))' }}> *</span>}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.dataType === 'Dropdown' ? (
                      <select className={`select ${bad ? 'err' : ''}`} disabled={locked} value={value} onChange={(e) => setVals((old) => ({ ...old, [id]: e.target.value }))} data-testid={`input-value-${id}`}>
                        <option value="">{opts.some((o) => o.active) ? 'Select…' : 'No options configured'}</option>
                        {opts.filter((o) => o.active).map((o) => <option key={o.id} value={o.code}>{o.label}</option>)}
                      </select>
                    ) : p.dataType === 'Boolean' ? (
                      <select className={`select ${bad ? 'err' : ''}`} disabled={locked} value={value} onChange={(e) => setVals((old) => ({ ...old, [id]: e.target.value }))} data-testid={`input-value-${id}`}>
                        <option value="">Select…</option><option>Yes</option><option>No</option>
                      </select>
                    ) : (
                      <input className={`input ${bad ? 'err' : ''} ${p.dataType === 'Numeric' ? 'mono' : ''}`} disabled={locked}
                        type={p.dataType === 'Date' ? 'date' : p.dataType === 'Numeric' ? 'number' : 'text'} step={p.dataType === 'Numeric' ? 'any' : undefined}
                        value={value} onChange={(e) => setVals((old) => ({ ...old, [id]: e.target.value }))} data-testid={`input-value-${id}`} />
                    )}
                    {p.unit && <span className="mono text-xs text-muted-foreground whitespace-nowrap">{p.unit}</span>}
                  </div>
                  <div className="text-xs">
                    <div className="lbl">Reference</div>
                    <div className={`mono ${ev.state === 'single' ? '' : 'text-muted-foreground'}`} data-testid={`text-reference-${id}`}>{ev.text}</div>
                  </div>
                  <div>{ev.flag && <Pill tone={flagTone(ev.flag)}>{flagLabel(ev.flag)}</Pill>}</div>
                </div>
                {bad && <div className="text-[11px] mt-1" style={{ color: 'hsl(var(--bad))' }} data-testid={`text-error-${id}`}>{err}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t px-6 py-3 bg-card">
        {errs.length > 0 && <ul className="text-xs mb-2 list-disc pl-4" style={{ color: 'hsl(var(--bad))' }} data-testid="list-validation-errors">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {!locked && (
          <div className="flex items-center gap-2">
            <button className="btn" disabled={busy || !test} onClick={() => save(false)} data-testid="button-save-draft">Save draft</button>
            <button className="btn btn-primary ml-auto" disabled={busy || !test} onClick={() => save(true)} data-testid="button-complete-result">{busy ? 'Saving…' : 'Mark as Completed'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
