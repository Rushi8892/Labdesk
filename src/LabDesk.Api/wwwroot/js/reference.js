import { html, toast } from './dom.js';
import { openModal } from './modal.js';
import { field, input, select, check, bindForm } from './forms.js';
import { api } from './api.js';
import { mutate, operator } from './store.js';
import { isApproved, str, toNum } from './lab.js';

const NUMS = ['ageFrom', 'ageTo', 'lowerValue', 'upperValue', 'criticalLow', 'criticalHigh'];

export function openReferenceEditor({ param, reference, contexts }) {
  const approved = !!reference && isApproved(reference);
  const f = {
    context: reference?.context ?? '', ageFrom: str(reference?.ageFrom), ageTo: str(reference?.ageTo), sex: reference?.sex ?? 'Any',
    lowerValue: str(reference?.lowerValue), upperValue: str(reference?.upperValue),
    lowerOperator: reference?.lowerOperator ?? '>=', upperOperator: reference?.upperOperator ?? '<=',
    referenceText: reference?.referenceText ?? '', decisionType: reference?.decisionType ?? '',
    criticalLow: str(reference?.criticalLow), criticalHigh: str(reference?.criticalHigh),
    unit: reference?.unit ?? param.unit ?? '', effectiveFrom: (reference?.effectiveFrom ?? '').slice(0, 10),
    effectiveTo: (reference?.effectiveTo ?? '').slice(0, 10), source: reference?.source ?? '', active: reference?.active ?? true,
  };
  const nums = (v) => Object.fromEntries(NUMS.map((k) => [k, toNum(v[k])]));
  const validate = (v) => {
    const n = nums(v);
    const e = {};
    if (!v.context.trim()) e.context = 'Required';
    NUMS.forEach((k) => { if (n[k] !== null && Number.isNaN(n[k])) e[k] = 'Not a number'; });
    if (n.ageFrom !== null && n.ageFrom < 0) e.ageFrom = 'Must be \u2265 0';
    if (n.ageFrom !== null && n.ageTo !== null && n.ageFrom > n.ageTo) e.ageTo = 'Must be \u2265 from';
    if (n.lowerValue !== null && n.upperValue !== null && n.lowerValue > n.upperValue) e.upperValue = 'Must be \u2265 lower';
    if (v.decisionType === 'Above' || v.decisionType === 'Equals') {
      if (n.lowerValue === null) e.lowerValue = `${v.decisionType} needs a lower value (threshold)`;
      if (n.upperValue !== null) e.upperValue = 'Leave empty for this decision type';
    }
    if (v.decisionType === 'Below') {
      if (n.upperValue === null) e.upperValue = 'Below needs an upper value';
      if (n.lowerValue !== null) e.lowerValue = 'Leave empty for this decision type';
    }
    if (v.effectiveFrom && v.effectiveTo && v.effectiveFrom > v.effectiveTo) e.effectiveTo = 'Before start date';
    return e;
  };
  const inp = (k, label, type = 'text', hint, list) => field(k, label, input(k, f[k], { type, list, testid: `input-ref-${k}` }), { hint });
  const ver = reference?.version ?? 1;
  const body = html`
    ${approved ? html`<div class="note-warn" data-testid="text-new-version-note">Version ${ver} is approved and stays unchanged. Saving creates version ${ver + 1} as a new unapproved record. Deactivate the old version once the new one is approved.</div>` : ''}
    <datalist id="ctx-list">${contexts.map((c) => html`<option value="${c}"></option>`)}</datalist>
    <div class="grid3">
      ${inp('context', 'Context', 'text', 'Laboratory population label. Result matching uses age and sex, not this label.', 'ctx-list')}
      ${field('sex', 'Sex', select('sex', f.sex, ['Any', 'Male', 'Female', 'Other'], { testid: 'select-ref-sex' }))}
      ${inp('unit', 'Unit')}
      ${inp('ageFrom', 'Age from (years)', 'number')}${inp('ageTo', 'Age to (years)', 'number')}<div></div>
      ${field('lowerOperator', 'Lower operator', select('lowerOperator', f.lowerOperator, ['>=', '>'], { testid: 'select-ref-lowerOperator' }))}
      ${inp('lowerValue', 'Lower value', 'number')}<div></div>
      ${field('upperOperator', 'Upper operator', select('upperOperator', f.upperOperator, ['<=', '<'], { testid: 'select-ref-upperOperator' }))}
      ${inp('upperValue', 'Upper value', 'number')}<div></div>
      ${inp('criticalLow', 'Critical low', 'number')}${inp('criticalHigh', 'Critical high', 'number')}<div></div>
      ${inp('referenceText', 'Reference text')}
      ${field('decisionType', 'Decision type', select('decisionType', f.decisionType, [{ value: '', label: 'None (use interval)' }, 'Above', 'Below', 'Equals'], { testid: 'select-ref-decisionType' }),
        { hint: 'Abnormal triggers, not normal ranges. Above: flags High when result > lower value. Below: flags Low when result < upper value. Equals: flags Abnormal when result differs from lower value. Operators apply to Range only.' })}
      ${inp('source', 'Source')}
      ${inp('effectiveFrom', 'Effective from', 'date')}${inp('effectiveTo', 'Effective to', 'date')}
      ${check('active', f.active, 'Active', 'check-ref-active')}
    </div>`;
  openModal({
    wide: true, title: `${reference ? 'Edit' : 'New'} reference interval`,
    subtitle: `${param.code} \u00b7 ${param.name}. All values are lab-entered; none are suggested.`,
    saveLabel: approved ? 'Create new version' : 'Save reference', body,
    onMount: (ctx) => bindForm(ctx.root, f, validate, (v) => {
      ctx.root.querySelectorAll('[data-k="lowerOperator"],[data-k="upperOperator"]').forEach((s) => { s.disabled = !!v.decisionType; });
    }),
    onSave: async (ctx) => {
      if (Object.keys(validate(f)).length) return ctx.setErr('Fix the highlighted fields.');
      const n = nums(f);
      const b = {
        parameterId: param.id, context: f.context.trim(), ageFrom: n.ageFrom, ageTo: n.ageTo, sex: f.sex,
        lowerValue: n.lowerValue, upperValue: n.upperValue, lowerOperator: f.lowerOperator, upperOperator: f.upperOperator,
        referenceText: f.referenceText, decisionType: f.decisionType, criticalLow: n.criticalLow, criticalHigh: n.criticalHigh,
        unit: f.unit, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo, source: f.source, active: f.active,
      };
      let data;
      if (!reference) data = { ...b, version: 1, approvedBy: null, approvedAt: null };
      else if (approved) data = { ...b, version: ver + 1, approvedBy: null, approvedAt: null };
      else data = { ...b, id: reference.id, version: reference.version, approvedBy: null, approvedAt: null };
      await mutate(() => api.saveReference(data));
      toast(approved ? 'New unapproved version created' : 'Reference saved');
      ctx.close();
    },
  });
}

export function openApproveDialog({ reference, label }) {
  const f = { approvedBy: operator() };
  const body = html`<p class="muted xs" style="margin-bottom:12px">The name is recorded as temporary operator attribution. It is typed, not verified by a sign-in.</p>
    ${field('approvedBy', 'Approved by (operator name)', input('approvedBy', f.approvedBy, { testid: 'input-approved-by' }))}`;
  openModal({
    title: 'Approve reference interval', subtitle: label, saveLabel: 'Approve', body,
    onMount: (ctx) => {
      bindForm(ctx.root, f, () => ({}));
      const el = ctx.root.querySelector('[data-k="approvedBy"]');
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.save(); } });
      el.focus();
    },
    onSave: async (ctx) => {
      if (f.approvedBy.trim().length < 2) return ctx.setErr('Enter the operator name (2+ characters).');
      await mutate(() => api.approveReference(reference.id, { approvedBy: f.approvedBy.trim() }));
      toast('Reference approved');
      ctx.close();
    },
  });
}
