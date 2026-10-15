import { html, setHTML, pill, toast } from './dom.js';
import { api } from './api.js';
import { mutate } from './store.js';
import { applicable, evaluate, flagLabel, flagTone, indexCatalog, msg, statusTone, validateValue } from './lab.js';

// Mounts dynamic result entry. Existing results use their saved configuration snapshot, never live metadata.
export function mountResultEntry(host, { result, liveIx, onSaved }) {
  const cfg = result?.configuration;
  const ix = cfg
    ? indexCatalog({ tests: [cfg.test], parameters: cfg.parameters || [], options: cfg.options || [], references: cfg.references || [] })
    : liveIx;
  const locked = !!result && result.status === 'Completed';
  const h = {
    testId: result ? String(result.testId) : '',
    patientName: result?.patientName ?? '',
    age: result ? String(result.age) : '',
    sex: result?.sex ?? 'Male',
    collectedAt: (result?.collectedAt ?? '').slice(0, 16),
  };
  let vals = {};
  (result?.values || []).forEach((v) => { vals[v.parameterId] = v.value ?? ''; });
  let errs = [];
  let showVal = false;
  let busy = false;
  let alive = true;

  const tid = () => Number(h.testId);
  const test = () => ix.testById.get(tid());
  const params = () => (ix.paramsByTest.get(tid()) ?? []).filter((p) => p.active || (result?.values || []).some((v) => v.parameterId === p.id));
  const age = () => (h.age.trim() === '' ? null : Number(h.age));
  const rowFor = (p) => {
    const id = p.id;
    const value = vals[id] ?? '';
    const opts = ix.optsByParam.get(id) ?? [];
    const matches = applicable(p, ix.refsByParam.get(id) ?? [], { age: age(), sex: h.sex, collectedAt: h.collectedAt });
    const evaluation = evaluate(p, value, matches, opts);
    const prior = locked ? (result?.values || []).find((x) => x.parameterId === id) : undefined;
    const ev = prior
      ? { state: prior.referenceText ? 'single' : 'none', text: prior.referenceText || 'Not configured', flag: prior.flag ?? '', referenceId: prior.referenceId ?? null }
      : evaluation;
    return { p, id, value, opts, ev, err: validateValue(p, value, opts) };
  };

  const sexes = ['Male', 'Female', 'Other'];
  const dis = locked ? html` disabled` : '';
  const testOpts = ix.raw.tests.filter((t) => t.active || t.id === result?.testId);
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
        <label class="field"><span class="lbl">Patient name</span><input class="input" data-h="patientName" value="${h.patientName}" data-testid="input-patient-name"${dis}></label>
        <label class="field"><span class="lbl">Age (years)</span><input class="input" type="number" min="0" data-h="age" value="${h.age}" data-testid="input-patient-age"${dis}></label>
        <label class="field"><span class="lbl">Sex</span><select class="select" data-h="sex" data-testid="select-patient-sex"${dis}>${sexes.map((s) => html`<option${s === h.sex ? html` selected` : ''}>${s}</option>`)}</select></label>
        <label class="field"><span class="lbl">Collected at</span><input class="input" type="datetime-local" data-h="collectedAt" value="${h.collectedAt}" data-testid="input-collected-at"${dis}></label>
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
          <div class="xs"><div class="lbl">Reference</div><div class="mono" data-ref data-testid="text-reference-${r.id}"></div></div>
          <div data-flag></div>
        </div>
        <div class="xxs bad-text" data-err data-testid="text-error-${r.id}" style="margin-top:4px" hidden></div>
      </div>`;
    }));
    ps.forEach(updateRow);
  };

  const updateRow = (p) => {
    const el = rowsHost.querySelector(`[data-row="${p.id}"]`);
    if (!el) return;
    const r = rowFor(p);
    const bad = (showVal || r.value) && r.err;
    const ref = el.querySelector('[data-ref]');
    ref.textContent = r.ev.text;
    ref.classList.toggle('muted', r.ev.state !== 'single');
    setHTML(el.querySelector('[data-flag]'), r.ev.flag ? pill(flagTone(r.ev.flag), flagLabel(r.ev.flag)) : '');
    el.querySelector('[data-v]').classList.toggle('err', !!bad);
    const e = el.querySelector('[data-err]');
    e.hidden = !bad;
    e.textContent = bad ? r.err : '';
  };
  const updateAll = () => params().forEach(updateRow);

  const renderFoot = () => {
    setHTML($('[data-slot="errs"]'), errs.length ? html`<ul class="errlist" data-testid="list-validation-errors">${errs.map((e) => html`<li>${e}</li>`)}</ul>` : '');
    host.querySelectorAll('[data-save]').forEach((b) => { b.disabled = busy || !test(); });
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
      else if (k !== 'patientName') updateAll();
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
    const a = age();
    const e = [];
    if (!t) e.push('Choose a test');
    if (!h.patientName.trim()) e.push('Patient name is required');
    if (a === null || Number.isNaN(a) || a < 0) e.push('Age in years must be 0 or more');
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
        id: result?.id, testId: tid(), patientName: h.patientName.trim(), age: a, sex: h.sex,
        collectedAt: h.collectedAt, complete, values: rows.map(({ p, value }) => ({ parameterId: p.id, value: value.trim() })),
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

  renderRows();
  renderFoot();
  return { destroy() { alive = false; } };
}
