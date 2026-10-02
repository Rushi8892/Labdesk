import { useState } from 'react';
import type { ReferenceInterval, TestParameter } from '@workspace/api-client-react';
import { Check, ConfirmFoot, Field, Modal } from '@/components/kit';
import { useLab, useOperator } from '@/hooks/use-lab';
import { isApproved, msg, str, toNum } from '@/lib/lab';

const grid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 } as const;

export function ReferenceEditor({ param, reference, contexts, onClose }: { param: TestParameter; reference?: ReferenceInterval; contexts: string[]; onClose: () => void }) {
  const lab = useLab();
  const [err, setErr] = useState<string | null>(null);
  const approved = !!reference && isApproved(reference);
  const [f, setF] = useState({
    context: reference?.context ?? '', ageFrom: str(reference?.ageFrom), ageTo: str(reference?.ageTo), sex: reference?.sex ?? 'Any',
    lowerValue: str(reference?.lowerValue), upperValue: str(reference?.upperValue),
    lowerOperator: reference?.lowerOperator ?? '>=', upperOperator: reference?.upperOperator ?? '<=',
    referenceText: reference?.referenceText ?? '', decisionType: reference?.decisionType ?? '',
    criticalLow: str(reference?.criticalLow), criticalHigh: str(reference?.criticalHigh),
    unit: reference?.unit ?? param.unit ?? '', effectiveFrom: (reference?.effectiveFrom ?? '').slice(0, 10),
    effectiveTo: (reference?.effectiveTo ?? '').slice(0, 10), source: reference?.source ?? '', active: reference?.active ?? true,
  });
  const s = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const n = {
    ageFrom: toNum(f.ageFrom), ageTo: toNum(f.ageTo), lowerValue: toNum(f.lowerValue), upperValue: toNum(f.upperValue),
    criticalLow: toNum(f.criticalLow), criticalHigh: toNum(f.criticalHigh),
  };
  const errs: Record<string, string> = {};
  if (!f.context.trim()) errs.context = 'Required';
  (Object.keys(n) as (keyof typeof n)[]).forEach((k) => { if (n[k] !== null && Number.isNaN(n[k])) errs[k] = 'Not a number'; });
  if (n.ageFrom !== null && n.ageFrom < 0) errs.ageFrom = 'Must be ≥ 0';
  if (n.ageFrom !== null && n.ageTo !== null && n.ageFrom > n.ageTo) errs.ageTo = 'Must be ≥ from';
  if (n.lowerValue !== null && n.upperValue !== null && n.lowerValue > n.upperValue) errs.upperValue = 'Must be ≥ lower';
  if (f.decisionType === 'Above' || f.decisionType === 'Equals') {
    if (n.lowerValue === null) errs.lowerValue = `${f.decisionType} needs a lower value (threshold)`;
    if (n.upperValue !== null) errs.upperValue = 'Leave empty for this decision type';
  }
  if (f.decisionType === 'Below') {
    if (n.upperValue === null) errs.upperValue = 'Below needs an upper value';
    if (n.lowerValue !== null) errs.lowerValue = 'Leave empty for this decision type';
  }
  if (f.effectiveFrom && f.effectiveTo && f.effectiveFrom > f.effectiveTo) errs.effectiveTo = 'Before start date';
  const submit = async () => {
    if (Object.keys(errs).length) return setErr('Fix the highlighted fields.');
    const body = {
      parameterId: param.id as number, context: f.context.trim(), ageFrom: n.ageFrom, ageTo: n.ageTo, sex: f.sex as ReferenceInterval['sex'],
      lowerValue: n.lowerValue, upperValue: n.upperValue, lowerOperator: f.lowerOperator as ReferenceInterval['lowerOperator'],
      upperOperator: f.upperOperator as ReferenceInterval['upperOperator'], referenceText: f.referenceText, decisionType: f.decisionType,
      criticalLow: n.criticalLow, criticalHigh: n.criticalHigh, unit: f.unit, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo,
      source: f.source, active: f.active,
    };
    try {
      if (!reference) await lab.saveReference.mutateAsync({ data: { ...body, version: 1, approvedBy: null, approvedAt: null } });
      else if (approved) await lab.saveReference.mutateAsync({ data: { ...body, version: (reference.version ?? 1) + 1, approvedBy: null, approvedAt: null } });
      else await lab.saveReference.mutateAsync({ data: { ...body, id: reference.id, version: reference.version, approvedBy: null, approvedAt: null } });
      lab.toast({ title: approved ? 'New unapproved version created' : 'Reference saved' });
      onClose();
    } catch (e) { setErr(msg(e)); }
  };
  const inp = (k: keyof typeof f, label: string, type = 'text', hint?: string, list?: string) => (
    <Field label={label} error={errs[k]} hint={hint}>
      <input className={`input ${errs[k] ? 'err' : ''}`} type={type} step={type === 'number' ? 'any' : undefined} list={list} value={f[k] as string} onChange={(e) => s(k, e.target.value)} data-testid={`input-ref-${k}`} />
    </Field>
  );
  return (
    <Modal wide title={`${reference ? 'Edit' : 'New'} reference interval`} subtitle={`${param.code} · ${param.name}. All values are lab-entered; none are suggested.`} onClose={onClose}
      footer={<ConfirmFoot onClose={onClose} onSave={submit} busy={lab.saveReference.isPending} label={approved ? 'Create new version' : 'Save reference'} />}>
      {approved && (
        <div className="mb-3 p-2.5 rounded text-xs" style={{ background: 'hsl(var(--warn-bg))', color: 'hsl(var(--warn))' }} data-testid="text-new-version-note">
          Version {reference?.version ?? 1} is approved and stays unchanged. Saving creates version {(reference?.version ?? 1) + 1} as a new unapproved record. Deactivate the old version once the new one is approved.
        </div>
      )}
      <datalist id="ctx-list">{contexts.map((c) => <option key={c} value={c} />)}</datalist>
      <div style={grid}>
        {inp('context', 'Context', 'text', 'Must match result context exactly (case-insensitive)', 'ctx-list')}
        <Field label="Sex">
          <select className="select" value={f.sex} onChange={(e) => s('sex', e.target.value)} data-testid="select-ref-sex">{['Any', 'Male', 'Female', 'Other'].map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        {inp('unit', 'Unit')}
        {inp('ageFrom', 'Age from (years)', 'number')}
        {inp('ageTo', 'Age to (years)', 'number')}
        <div />
        <Field label="Lower operator">
          <select className="select" disabled={!!f.decisionType} value={f.lowerOperator} onChange={(e) => s('lowerOperator', e.target.value)} data-testid="select-ref-lowerOperator"><option>{'>='}</option><option>{'>'}</option></select>
        </Field>
        {inp('lowerValue', 'Lower value', 'number')}
        <div />
        <Field label="Upper operator">
          <select className="select" disabled={!!f.decisionType} value={f.upperOperator} onChange={(e) => s('upperOperator', e.target.value)} data-testid="select-ref-upperOperator"><option>{'<='}</option><option>{'<'}</option></select>
        </Field>
        {inp('upperValue', 'Upper value', 'number')}
        <div />
        {inp('criticalLow', 'Critical low', 'number')}
        {inp('criticalHigh', 'Critical high', 'number')}
        <div />
        {inp('referenceText', 'Reference text')}
        <Field label="Decision type" hint="Abnormal triggers, not normal ranges. Above: flags High when result > lower value. Below: flags Low when result < upper value. Equals: flags Abnormal when result differs from lower value. Operators apply to Range only.">
          <select className="select" value={f.decisionType} onChange={(e) => s('decisionType', e.target.value)} data-testid="select-ref-decisionType">
            <option value="">None (use interval)</option><option>Above</option><option>Below</option><option>Equals</option>
          </select>
        </Field>
        {inp('source', 'Source')}
        {inp('effectiveFrom', 'Effective from', 'date')}
        {inp('effectiveTo', 'Effective to', 'date')}
        <Check checked={f.active} onChange={(v) => s('active', v)} label="Active" testId="check-ref-active" />
      </div>
      {err && <div className="mt-3 text-xs p-2 rounded" style={{ background: 'hsl(var(--bad-bg))', color: 'hsl(var(--bad))' }} data-testid="text-form-error">{err}</div>}
    </Modal>
  );
}

export function ApproveDialog({ reference, label, onClose }: { reference: ReferenceInterval; label: string; onClose: () => void }) {
  const lab = useLab();
  const op = useOperator();
  const [name, setName] = useState(op);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (name.trim().length < 2) return setErr('Enter the operator name (2+ characters).');
    try {
      await lab.approveReference.mutateAsync({ id: reference.id as number, data: { approvedBy: name.trim() } });
      lab.toast({ title: 'Reference approved' });
      onClose();
    } catch (e) { setErr(msg(e)); }
  };
  return (
    <Modal title="Approve reference interval" subtitle={label} onClose={onClose} footer={<ConfirmFoot onClose={onClose} onSave={submit} busy={lab.approveReference.isPending} label="Approve" />}>
      <p className="text-xs text-muted-foreground mb-3">The name is recorded as temporary operator attribution. It is typed, not verified by a sign-in.</p>
      <Field label="Approved by (operator name)">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} data-testid="input-approved-by" />
      </Field>
      {err && <div className="mt-3 text-xs p-2 rounded" style={{ background: 'hsl(var(--bad-bg))', color: 'hsl(var(--bad))' }} data-testid="text-form-error">{err}</div>}
    </Modal>
  );
}
