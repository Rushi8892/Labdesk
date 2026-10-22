import { html, setHTML, toast } from './dom.js';
import { api } from './api.js';
import { state, reloadAll } from './store.js';
import { rangeLines, msg, validateValue, isAbnormal, optionLabel } from './lab.js';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// One report covering several tests for one patient: tick the tests, type every
// parameter in one screen, then save. Each test stays its own result with its own
// number and snapshot, so it can be completed or reprinted on its own.
export function mountMultiEntry(host, { liveIx, onSaved }) {
  const ix = liveIx;
  let patientId = '';
  let collectedAt = localInput(new Date());
  let picked = []; // test ids, in the order they were ticked
  let search = '';
  let vals = {}; // parameterId -> text; parameter ids are unique across tests
  let errs = [];
  let showVal = false;
  let busy = false;
  let alive = true;

  const tests = () => ix.raw.tests.filter((t) => t.active);
  const params = (tid) => (ix.paramsByTest.get(tid) ?? []).filter((p) => p.active);
  const patient = () => (state.patients.data ?? []).find((p) => String(p.id) === patientId);
  const patientOpts = () => (state.patients.data ?? []).filter((p) => p.active);
  const rowFor = (p) => {
    const value = vals[p.id] ?? '';
    const opts = ix.optsByParam.get(p.id) ?? [];
    return { p, value, opts, lines: rangeLines(p), err: validateValue(p, value, opts) };
  };

  setHTML(host, html`<div class="entry pop">
    <div class="entry-head">
      <div class="b" style="font-size:15px">New report</div>
      <span class="xs muted">Tick one or more tests, then type every parameter.</span>
    </div>
    <div class="scroll entry-body">
      <div class="grid4">
        <label class="field" style="grid-column: span 2"><span class="lbl">Patient</span>
          <select class="select" data-h="patientId" data-testid="select-result-patient">
            <option value="">${patientOpts().length ? 'Select a patient\u2026' : 'No patients yet \u2014 add one on Patients'}</option>
            ${patientOpts().map((p) => html`<option value="${p.id}">${p.name} \u00b7 ${p.age} y \u00b7 ${p.sex}</option>`)}
          </select></label>
        <label class="field" style="grid-column: span 2"><span class="lbl">Collected at</span>
          <input class="input" type="datetime-local" data-h="collectedAt" value="${collectedAt}" data-testid="input-collected-at"></label>
      </div>
      <div class="panel" style="padding:12px">
        <div class="row" style="justify-content:space-between;gap:12px">
          <div class="b">Tests <span class="xs muted" data-slot="pickedcount"></span></div>
          <input class="input" data-f="search" placeholder="Search tests" style="width:240px" data-testid="input-search-tests">
        </div>
        <div class="tests-pick" data-slot="picker" style="max-height:170px;margin-top:8px"></div>
      </div>
      <div data-slot="sections" style="display:flex;flex-direction:column;gap:12px"></div>
    </div>
    <div class="entry-foot">
      <div data-slot="errs"></div>
      <div class="row">
        <button class="btn" data-save="draft" data-testid="button-save-drafts">Save drafts</button>
        <button class="btn btn-primary ml-auto" data-save="complete" data-testid="button-complete-results">Mark all as Completed</button>
      </div>
    </div>
  </div>`);

  const $ = (s) => host.querySelector(s);
  const sectionsHost = $('[data-slot="sections"]');
  const pickerHost = $('[data-slot="picker"]');

  function renderPicker() {
    const t = search.trim().toLowerCase();
    const list = tests().filter((x) => !t || `${x.code} ${x.name}`.toLowerCase().includes(t));
    setHTML(pickerHost, list.length ? html`${list.map((x) => html`<label class="check" data-testid="pick-test-${x.id}">
      <input type="checkbox" data-t="${x.id}"${picked.includes(x.id) ? html` checked` : ''} data-testid="check-test-${x.id}">
      <span class="xs truncate"><b class="mono">${x.code}</b> ${x.name}<span class="muted"> \u00b7 ${ix.cat.get(x.categoryId)?.name ?? ''}</span></span>
    </label>`)}` : html`<div class="xs muted" style="padding:4px">No test matches.</div>`);
    $('[data-slot="pickedcount"]').textContent = picked.length ? `\u00b7 ${picked.length} selected` : '';
  }

  const control = (r) => {
    const { p, value, opts } = r;
    if (p.dataType === 'Dropdown') {
      const act = opts.filter((o) => o.active);
      return html`<select class="select" data-v="${p.id}" data-testid="input-value-${p.id}">
        <option value="">${act.length ? 'Select\u2026' : 'No options configured'}</option>
        ${act.map((o) => html`<option value="${o.code}"${o.code === value ? html` selected` : ''}>${o.label}</option>`)}</select>`;
    }
    if (p.dataType === 'Boolean') {
      return html`<select class="select" data-v="${p.id}" data-testid="input-value-${p.id}">
        <option value="">Select\u2026</option>${['Yes', 'No'].map((o) => html`<option${o === value ? html` selected` : ''}>${o}</option>`)}</select>`;
    }
    const type = p.dataType === 'Date' ? 'date' : p.dataType === 'Numeric' ? 'number' : 'text';
    return html`<input class="input ${p.dataType === 'Numeric' ? 'mono' : ''}" type="${type}"${type === 'number' ? html` step="any"` : ''} data-v="${p.id}" value="${value}" data-testid="input-value-${p.id}">`;
  };

  const rowHtml = (p) => {
    const r = rowFor(p);
    return html`<div class="panel prow" data-row="${p.id}" data-testid="param-row-${p.id}">
      <div class="prow-grid">
        <div><div class="sb">${p.name}${p.required ? html`<span class="req"> *</span>` : ''}</div></div>
        <div class="row">${control(r)}${p.unit ? html`<span class="mono xs muted nowrap">${p.unit}</span>` : ''}</div>
        <div><div class="lbl">Reference</div><div class="mono xs" data-ref data-testid="text-reference-${p.id}"></div></div>
      </div>
      <div class="xxs bad-text" data-err data-testid="text-error-${p.id}" style="margin-top:4px" hidden></div>
    </div>`;
  };

  function renderSections() {
    setHTML(sectionsHost, picked.map((tid) => {
      const t = ix.testById.get(tid);
      const list = params(tid);
      return html`<section class="panel" data-sec="${tid}" data-testid="test-section-${tid}">
        <div class="sec-head">
          <div class="b">${t.code} \u00b7 ${t.name} <span class="muted xs">${list.length} parameter${list.length === 1 ? '' : 's'}</span></div>
          <button class="btn btn-ghost btn-sm" data-remove="${tid}" data-testid="button-remove-test-${tid}">Remove</button>
        </div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
          ${list.length ? list.map(rowHtml) : html`<div class="xs muted">No active parameters.</div>`}
        </div>
      </section>`;
    }));
    picked.forEach((tid) => params(tid).forEach(updateRow));
  }

  function updateRow(p) {
    const el = sectionsHost.querySelector(`[data-row="${p.id}"]`);
    if (!el) return;
    const r = rowFor(p);
    const bad = (showVal || r.value) && r.err;
    // Rendered line by line: one parameter may print three references.
    setHTML(el.querySelector('[data-ref]'), r.lines.length
      ? html`${r.lines.map((line, i) => html`<div data-testid="text-reference-${p.id}-${i}">${line}</div>`)}`
      : html`<div class="muted" data-testid="text-reference-${p.id}-none">Not configured</div>`);
    const v = el.querySelector('[data-v]');
    v.classList.toggle('err', !!bad);
    v.classList.toggle('bad-text', !bad && isAbnormal(optionLabel(r.value, r.opts), r.lines, patient()?.sex));
    const e = el.querySelector('[data-err]');
    e.hidden = !bad;
    e.textContent = bad ? r.err : '';
  }

  const updateAll = () => picked.forEach((tid) => params(tid).forEach(updateRow));

  function renderFoot() {
    setHTML($('[data-slot="errs"]'), errs.length ? html`<ul class="errlist" data-testid="list-validation-errors">${errs.map((e) => html`<li>${e}</li>`)}</ul>` : '');
    host.querySelectorAll('[data-save]').forEach((b) => { b.disabled = busy || !patient() || picked.length === 0; });
    const c = $('[data-save="complete"]');
    if (c) c.textContent = busy ? 'Saving\u2026' : 'Mark all as Completed';
  }

  host.addEventListener('input', (ev) => {
    const f = ev.target.closest('[data-f="search"]');
    if (f) { search = f.value; renderPicker(); return; }
    const hd = ev.target.closest('[data-h]');
    if (hd) {
      if (errs.length) { errs = []; renderFoot(); }
      if (hd.dataset.h === 'patientId') { patientId = hd.value; renderFoot(); }
      else { collectedAt = hd.value; }
      return;
    }
    const v = ev.target.closest('[data-v]');
    if (v) {
      vals[Number(v.dataset.v)] = v.value;
      const p = ix.paramById.get(Number(v.dataset.v));
      if (p) updateRow(p);
    }
  });

  host.addEventListener('change', (ev) => {
    const box = ev.target.closest('[data-t]');
    if (!box) return;
    const tid = Number(box.dataset.t);
    if (box.checked) { if (!picked.includes(tid)) picked = [...picked, tid]; }
    else picked = picked.filter((x) => x !== tid);
    renderPicker();
    renderSections();
    renderFoot();
  });

  host.addEventListener('click', (ev) => {
    const rm = ev.target.closest('[data-remove]');
    if (rm) {
      picked = picked.filter((x) => x !== Number(rm.dataset.remove));
      renderPicker();
      renderSections();
      renderFoot();
      return;
    }
    const b = ev.target.closest('[data-save]');
    if (b) save(b.dataset.save === 'complete');
  });

  async function save(complete) {
    if (busy) return;
    const p = patient();
    const e = [];
    if (!p) e.push('Choose a patient');
    if (!collectedAt) e.push('Collected date is required');
    if (!picked.length) e.push('Choose at least one test');
    if (complete) {
      picked.forEach((tid) => {
        const t = ix.testById.get(tid);
        params(tid).map(rowFor).forEach((r) => {
          if (r.err) e.push(`${t.code} ${r.p.name}: ${r.err}`);
          else if (r.p.required && !r.value.trim()) e.push(`${t.code} ${r.p.name}: Required`);
        });
      });
    }
    showVal = complete;
    errs = e;
    updateAll();
    renderFoot();
    if (e.length) return;

    busy = true;
    renderFoot();
    const iso = new Date(collectedAt).toISOString();
    const made = [];
    let failure = null;
    try {
      for (const tid of picked) {
        const values = params(tid).map((param) => ({ parameterId: param.id, value: (vals[param.id] ?? '').trim() }));
        const saved = await api.saveResult({ patientId: p.id, testId: tid, collectedAt: iso, complete, values });
        made.push(saved.id);
      }
    } catch (err) {
      failure = err;
    }
    // A partial run still saved some tests, so always refresh the worklist.
    await reloadAll();
    busy = false;
    if (!alive) return;
    if (failure) {
      errs = [`Saved ${made.length} of ${picked.length} tests. ${msg(failure)}`];
      renderFoot();
      return;
    }
    toast(complete ? `${made.length} results completed` : `${made.length} drafts saved`,
      complete ? 'Open the patient to save one PDF with all their reports.' : '');
    onSaved(made);
  }

  renderPicker();
  renderSections();
  renderFoot();
  return { destroy() { alive = false; } };
}
