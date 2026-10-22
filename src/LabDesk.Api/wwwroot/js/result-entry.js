import { html, setHTML, pill, toast } from './dom.js';
import { api } from './api.js';
import { state, mutate } from './store.js';
import { rangeLines, msg, statusTone, validateValue, isAbnormal, optionLabel } from './lab.js';

const pad = (n) => String(n).padStart(2, '0');
// datetime-local speaks local wall time; timestamps travel as UTC.
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Mounts dynamic result entry: the patient is chosen from the register, the test
// from the catalog, then the values are typed. References come from the live
// catalog; the server re-checks everything and freezes the report on completion.
export function mountResultEntry(host, { result, liveIx, onSaved }) {
  const ix = liveIx;
  const locked = !!result && result.status === 'Completed';
  const h = {
    testId: result ? String(result.testId) : '',
    patientId: result ? String(result.patientId) : '',
    collectedAt: result?.collectedAt ? localInput(new Date(result.collectedAt)) : localInput(new Date()),
  };
  let vals = {};
  (result?.values || []).forEach((v) => { vals[v.parameterId] = v.value ?? ''; });
  let errs = [];
  let showVal = false;
  let busy = false;
  let alive = true;

  const tid = () => Number(h.testId);
  const test = () => ix.testById.get(tid());
  const pts = () => state.patients.data ?? [];
  const patient = () => pts().find((p) => String(p.id) === h.patientId);
  const params = () => (ix.paramsByTest.get(tid()) ?? []).filter((p) => p.active || (result?.values || []).some((v) => v.parameterId === p.id));
  const rowFor = (p) => {
    const id = p.id;
    const value = vals[id] ?? '';
    const opts = ix.optsByParam.get(id) ?? [];
    // A completed result shows the references it was completed with, not today's.
    const prior = locked ? (result?.values || []).find((x) => x.parameterId === id) : undefined;
    const lines = prior ? (prior.normalRanges ?? []) : rangeLines(p);
    return { p, id, value, opts, lines, err: validateValue(p, value, opts) };
  };

  const patientOpts = pts().filter((p) => p.active || p.id === result?.patientId);
  const testOpts = ix.raw.tests.filter((t) => t.active || t.id === result?.testId);
  const dis = locked ? html` disabled` : '';
  setHTML(host, html`<div class="entry pop">
    <div class="entry-head">
      <div class="b" style="font-size:15px">${result ? `Result #${result.id}` : 'New result'}</div>
      ${result ? pill(statusTone(result.status), result.status) : ''}
      ${locked ? html`<span class="xs ml-auto" style="color:hsl(var(--warn))">Completed \u00b7 read only</span>` : ''}
    </div>
    <div class="scroll entry-body">
      <div class="grid4">
        <label class="field" style="grid-column: span 2"><span class="lbl">Test</span>
          <select class="select" data-h="testId" data-testid="select-result-test"${locked || result ? html` disabled` : ''}>
            <option value="">Select a test\u2026</option>
            ${testOpts.map((t) => html`<option value="${t.id}"${String(t.id) === h.testId ? html` selected` : ''}>${t.code} \u00b7 ${t.name}</option>`)}
          </select></label>
        <label class="field" style="grid-column: span 2"><span class="lbl">Patient</span>
          <select class="select" data-h="patientId" data-testid="select-result-patient"${locked || result ? html` disabled` : ''}>
            <option value="">${patientOpts.length ? 'Select a patient\u2026' : 'No patients yet \u2014 add one on Patients'}</option>
            ${patientOpts.map((p) => html`<option value="${p.id}"${String(p.id) === h.patientId ? html` selected` : ''}>${p.name} \u00b7 ${p.age} y \u00b7 ${p.sex}${p.active ? '' : ' \u00b7 inactive'}</option>`)}
          </select></label>
        <label class="field" style="grid-column: span 2"><span class="lbl">Collected at</span><input class="input" type="datetime-local" data-h="collectedAt" value="${h.collectedAt}" data-testid="input-collected-at"${locked ? html` disabled` : ''}></label>
        <div class="field" style="grid-column: span 2"><span class="lbl">Report header</span>
          <div class="xs" data-slot="patientinfo"></div></div>
      </div>
      <div data-slot="noparams"></div>
      <div data-slot="rows" style="display:flex;flex-direction:column;gap:8px"></div>
    </div>
    <div class="entry-foot">
      <div data-slot="errs"></div>
      ${!locked ? html`<div class="row">
        <button class="btn" data-save="draft" data-testid="button-save-draft">Save draft</button>
        <button class="btn btn-primary ml-auto" data-save="complete" data-testid="button-complete-result">Mark as Completed</button>
      </div>` : ''}
    </div>
  </div>`);

  const $ = (s) => host.querySelector(s);
  const rowsHost = $('[data-slot="rows"]');

  const control = (r) => {
    const { p, id, value, opts } = r;
    if (p.dataType === 'Dropdown') {
      const act = opts.filter((o) => o.active);
      return html`<select class="select" data-v="${id}" data-testid="input-value-${id}"${dis}>
        <option value="">${act.length ? 'Select\u2026' : 'No options configured'}</option>
        ${act.map((o) => html`<option value="${o.code}"${o.code === value ? html` selected` : ''}>${o.label}</option>`)}</select>`;
    }
    if (p.dataType === 'Boolean') {
      return html`<select class="select" data-v="${id}" data-testid="input-value-${id}"${dis}>
        <option value="">Select\u2026</option>${['Yes', 'No'].map((o) => html`<option${o === value ? html` selected` : ''}>${o}</option>`)}</select>`;
    }
    const type = p.dataType === 'Date' ? 'date' : p.dataType === 'Numeric' ? 'number' : 'text';
    return html`<input class="input ${p.dataType === 'Numeric' ? 'mono' : ''}" type="${type}"${type === 'number' ? html` step="any"` : ''} data-v="${id}" value="${value}" data-testid="input-value-${id}"${dis}>`;
  };

  const renderRows = () => {
    const ps = params();
    setHTML($('[data-slot="noparams"]'), test() && ps.length === 0 ? html`<div class="xs muted">This test has no active parameters.</div>` : '');
    setHTML(rowsHost, ps.map((p) => {
      const r = rowFor(p);
      return html`<div class="panel prow" data-row="${r.id}" data-testid="param-row-${r.id}">
        <div class="prow-grid">
          <div><div class="sb">${p.name}${p.required ? html`<span class="req"> *</span>` : ''}</div></div>
          <div class="row">${control(r)}${p.unit ? html`<span class="mono xs muted nowrap">${p.unit}</span>` : ''}</div>
          <div><div class="lbl">Reference</div><div class="mono xs" data-ref data-testid="text-reference-${r.id}"></div></div>
        </div>
        <div class="xxs bad-text" data-err data-testid="text-error-${r.id}" style="margin-top:4px" hidden></div>
      </div>`;
    }));
    ps.forEach(updateRow);
  };

  const updatePatientInfo = () => {
    const p = patient();
    const bits = p
      ? [p.name, `${p.age} y`, p.sex, p.doctorName ? `referred by ${p.doctorName}` : '', p.phone]
      : [];
    setHTML($('[data-slot="patientinfo"]'), bits.filter(Boolean).length
      ? html`${bits.filter(Boolean).join(' \u00b7 ')}`
      : html`<span class="muted">Choose a patient to print their name, age, sex and referring doctor.</span>`);
  };

  const updateRow = (p) => {
    const el = rowsHost.querySelector(`[data-row="${p.id}"]`);
    if (!el) return;
    const r = rowFor(p);
    const bad = (showVal || r.value) && r.err;
    // Rendered line by line: one parameter may print three references.
    setHTML(el.querySelector('[data-ref]'), r.lines.length
      ? html`${r.lines.map((line, i) => html`<div data-testid="text-reference-${r.id}-${i}">${line}</div>`)}`
      : html`<div class="muted" data-testid="text-reference-${r.id}-none">Not configured</div>`);
    const v = el.querySelector('[data-v]');
    v.classList.toggle('err', !!bad);
    v.classList.toggle('bad-text', !bad && isAbnormal(optionLabel(r.value, r.opts), r.lines, patient()?.sex));
    const e = el.querySelector('[data-err]');
    e.hidden = !bad;
    e.textContent = bad ? r.err : '';
  };
  const updateAll = () => params().forEach(updateRow);

  const renderFoot = () => {
    setHTML($('[data-slot="errs"]'), errs.length ? html`<ul class="errlist" data-testid="list-validation-errors">${errs.map((e) => html`<li>${e}</li>`)}</ul>` : '');
    host.querySelectorAll('[data-save]').forEach((b) => { b.disabled = busy || !test() || !patient(); });
    const c = $('[data-save="complete"]');
    if (c) c.textContent = busy ? 'Saving\u2026' : 'Mark as Completed';
  };

  const onHeader = (ev) => {
    if (errs.length) {
      errs = [];
      renderFoot();
    }
    const el = ev.target.closest('[data-h]');
    if (el) {
      const k = el.dataset.h;
      if (h[k] === el.value) return;
      h[k] = el.value;
      if (k === 'testId') { vals = {}; renderRows(); renderFoot(); }
      else if (k === 'patientId') { updatePatientInfo(); renderFoot(); }
      return;
    }
    const v = ev.target.closest('[data-v]');
    if (v) {
      vals[Number(v.dataset.v)] = v.value;
      const p = ix.paramById.get(Number(v.dataset.v));
      if (p) updateRow(p);
    }
  };
  host.addEventListener('input', onHeader);
  host.addEventListener('change', onHeader);

  const save = async (complete) => {
    if (busy) return;
    const t = test();
    const p = patient();
    const e = [];
    if (!t) e.push('Choose a test');
    if (!p) e.push('Choose a patient');
    if (!h.collectedAt) e.push('Collected date is required');
    const rows = params().map(rowFor);
    if (complete) {
      rows.forEach((r) => {
        if (r.err) e.push(`${r.p.name}: ${r.err}`);
        if (r.p.required && !r.value.trim() && !r.err) e.push(`${r.p.name}: Required`);
      });
    }
    showVal = complete;
    errs = e;
    updateAll();
    renderFoot();
    if (e.length) return;
    busy = true;
    renderFoot();
    try {
      const saved = await mutate(() => api.saveResult({
        id: result?.id, patientId: p.id, testId: tid(), collectedAt: new Date(h.collectedAt).toISOString(),
        complete, values: rows.map(({ p: param, value }) => ({ parameterId: param.id, value: value.trim() })),
      }));
      toast(complete ? 'Result completed' : 'Draft saved');
      busy = false;
      if (alive) renderFoot();
      onSaved(saved.id);
    } catch (err) {
      busy = false;
      if (!alive) return;
      errs = [msg(err)];
      renderFoot();
    }
  };
  host.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-save]');
    if (b) save(b.dataset.save === 'complete');
  });

  updatePatientInfo();
  renderRows();
  renderFoot();
  return { destroy() { alive = false; } };
}
