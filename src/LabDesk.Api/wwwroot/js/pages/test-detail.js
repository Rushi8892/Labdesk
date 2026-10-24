import { state, load, mutate } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, dash, skeleton, empty, errorBlock, onAct, icon } from '../dom.js';
import { rangeLines, rangeText, parameterCode } from '../lab.js';
import { openTestEditor, openParameterEditor, openOptionEditor } from '../editors.js';

export function mount(root, params) {
  const id = Number(params.id);
  const $ = (s) => root.querySelector(s);
  let selId = null;
  let lastSel = null;
  let busy = false;

  const ctx = () => {
    const ix = state.catalog.ix;
    const test = ix?.testById.get(id);
    const plist = ix?.paramsByTest.get(id) ?? [];
    const sel = plist.find((p) => p.id === selId) ?? plist[0];
    const opts = sel ? ix.optsByParam.get(sel.id) ?? [] : [];
    return { ix, test, plist, sel, opts };
  };

  // The fast path for filling a test: type a name, press Enter. Code, order and
  // the rest are filled in, so a menu of parameters needs no dialog each.
  const quick = (k) => root.querySelector(`[data-quick="${k}"]`);
  const clearQuick = () => ['name', 'unit', 'reference'].forEach((k) => { const el = quick(k); if (el) el.value = ''; });

  async function quickAdd() {
    if (busy) return;
    const name = quick('name').value.trim();
    const { plist } = ctx();
    if (!name) {
      quick('name').classList.add('err');
      quick('name').focus();
      return;
    }
    const reference = quick('reference').value.trim();
    busy = true;
    update();
    try {
      const saved = await mutate(() => api.saveParameter({
        testId: id, code: parameterCode(name, plist.map((p) => p.code)), name,
        dataType: quick('dataType').value, unit: quick('unit').value.trim(),
        normalRanges: reference ? [reference] : null,
        displayOrder: (plist[plist.length - 1]?.displayOrder ?? 0) + 10,
        required: false, active: true,
      }));
      selId = saved.id;
      clearQuick();
      quick('name').classList.remove('err');
    } catch { /* toasted */ }
    busy = false;
    update();
    quick('name').focus();
  }

  function update() {
    const s = state.catalog;
    const { ix, test, plist, sel, opts } = ctx();
    const stateEl = $('[data-slot="state"]');
    const content = $('[data-slot="content"]');
    let st = null;
    if (s.loading) st = skeleton(12);
    else if (s.error && !ix) st = errorBlock('the test');
    else if (!ix || !test) st = empty('Test not found', '', html`<a href="#/" class="btn">Back to catalog</a>`);
    stateEl.hidden = !st;
    content.hidden = !!st;
    if (st) { setHTML(stateEl, st); return; }

    $('[data-slot="title"]').textContent = `${test.code} \u00b7 ${test.name}`;
    setHTML($('[data-slot="actions"]'), html`${pill(test.active ? 'pill-ok' : '', test.active ? 'Active' : 'Inactive')}
      <button class="btn" data-act="toggle-test"${busy ? html` disabled` : ''} data-testid="button-toggle-test">${test.active ? 'Deactivate' : 'Activate'}</button>
      <button class="btn btn-ink" data-act="edit-test" data-testid="button-edit-test">Edit test</button>`);
    const info = [
      ['Category', ix.cat.get(test.categoryId)?.name], ['Specimen', ix.spec.get(test.specimenTypeId)?.name],
      ['Method', test.methodId ? ix.meth.get(test.methodId)?.name : 'None'], ['Container', test.container], ['Min. sample', test.minimumSample],
      ['Turnaround', test.turnaroundTime], ['Display order', String(test.displayOrder)],
      ['Report title', test.reportTitle], ['Short name', test.shortName],
    ];
    const long = [['Description', test.description], ['Patient preparation', test.patientPreparation], ['Collection', test.collectionInstructions], ['Notes', test.notes]];
    setHTML($('[data-slot="info"]'), html`${info.map(([k, v]) => html`<div><div class="lbl">${k}</div><div class="v truncate">${v || dash()}</div></div>`)}
      ${long.filter(([, v]) => v).map(([k, v]) => html`<div class="long"><div class="lbl">${k}</div><div class="xs">${v}</div></div>`)}`);

    $('[data-slot="pcount"]').textContent = String(plist.length);
    setHTML($('[data-slot="params"]'), plist.length === 0
      ? empty('No parameters yet', 'Type a name in the bar above and press Add, or use New parameter for several reference lines or a dropdown.', html`<button class="btn btn-primary" data-act="quick-focus" data-testid="button-first-parameter">Add the first parameter</button>`)
      : html`<table class="tbl">
        <thead><tr><th>Order</th><th>Code</th><th>Name</th><th>Type</th><th>Unit</th><th>Reference / normal ranges</th><th>Req</th><th>Status</th><th></th></tr></thead>
        <tbody>${plist.map((p, i) => {
          const range = rangeText(p);
          return html`<tr class="click ${p.id === sel?.id ? 'sel' : ''} ${p.active ? '' : 'off'}" data-act="sel-param" data-id="${p.id}" data-testid="row-param-${p.id}">
          <td><span class="row" style="gap:2px">
            <button class="btn btn-ghost btn-icon btn-sm" data-act="move" data-i="${i}" data-dir="-1"${i === 0 || busy ? html` disabled` : ''} aria-label="Move up" data-testid="button-up-${p.id}">${icon.up(12)}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-act="move" data-i="${i}" data-dir="1"${i === plist.length - 1 || busy ? html` disabled` : ''} aria-label="Move down" data-testid="button-down-${p.id}">${icon.down(12)}</button>
            <span class="mono muted" style="margin-left:4px">${p.displayOrder}</span></span></td>
          <td class="mono sb">${p.code}</td><td class="sb">${p.name}</td><td>${p.dataType}</td>
          <td class="mono">${p.unit || '\u2014'}</td>
          <td class="mono ${range === 'Not configured' ? 'muted' : ''}">${range}</td><td>${p.required ? 'Yes' : 'No'}</td>
          <td>${pill(p.active ? 'pill-ok' : '', p.active ? 'Active' : 'Inactive')}</td>
          <td class="right nowrap">
            <button class="btn btn-sm" data-act="edit-param" data-id="${p.id}" data-testid="button-edit-param-${p.id}">Edit</button>
            <button class="btn btn-sm" data-act="toggle-param" data-id="${p.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-param-${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button>
          </td></tr>`;
        })}</tbody></table>`);

    const aside = $('[data-slot="aside"]');
    if (!sel) { setHTML(aside, empty('Select a parameter', 'Its normal range and options appear here.')); lastSel = null; return; }
    const num = sel.dataType === 'Numeric';
    const lines = rangeLines(sel);
    setHTML(aside, html`<div class="scroll flex-1 ${lastSel !== sel.id ? 'pop' : ''}">
      <div class="aside-sec">
        <div class="lbl">Selected parameter</div>
        <div class="b" style="font-size:15px">${sel.name} <span class="mono muted">${sel.code}</span></div>
        <div class="xs muted" style="margin-top:4px">${sel.dataType}${sel.unit ? ` \u00b7 ${sel.unit}` : ''}${num ? ` \u00b7 decimals ${sel.decimalPlaces ?? 'any'} \u00b7 technical ${sel.technicalMin ?? '\u2212\u221e'} to ${sel.technicalMax ?? '+\u221e'} \u00b7 negative ${sel.allowNegative ? 'allowed' : 'blocked'}` : ''}</div>
        ${sel.notes ? html`<div class="xs" style="margin-top:4px">Note: ${sel.notes}</div>` : ''}
      </div>
      <div class="aside-sec">
        <div class="hd"><div class="b">Reference / normal ranges</div>
          <button class="btn btn-sm" data-act="edit-param" data-id="${sel.id}" data-testid="button-edit-param-range">Edit parameter</button></div>
        <div class="sb mono" data-testid="text-param-normal-range">${lines.length
          ? html`${lines.map((line, i) => html`<div data-testid="text-param-normal-range-${i}">${line}</div>`)}`
          : html`<span class="muted">Not configured</span>`}</div>
        <div class="xs muted" style="margin-top:4px">Printed line by line on the report. A result outside these lines prints in red.</div>
        ${lines.length === 0 ? html`<div class="note-warn" style="margin:8px 0 0" data-testid="text-range-not-configured">Not configured. Results show no reference until a line is added.</div>` : ''}
      </div>
      ${sel.dataType === 'Dropdown' ? html`<div class="aside-sec">
        <div class="hd"><div class="b">Options <span class="mono muted">${opts.length}</span></div>
          <button class="btn btn-sm btn-primary" data-act="new-option" data-testid="button-new-option">${icon.plus(12)} Add option</button></div>
        ${opts.length === 0 ? html`<div class="dash" style="color:hsl(var(--warn))">No options configured. Result entry cannot accept a value until options are added.</div>` : html`<table class="tbl">
          <thead><tr><th>Sort</th><th>Code</th><th>Label</th><th></th></tr></thead>
          <tbody>${opts.map((o) => html`<tr class="${o.active ? '' : 'off'}" data-testid="row-option-${o.id}">
            <td class="mono">${o.sortOrder}</td><td class="mono">${o.code}</td><td>${o.label}</td>
            <td class="right nowrap"><button class="btn btn-sm" data-act="edit-option" data-id="${o.id}" data-testid="button-edit-option-${o.id}">Edit</button>
              <button class="btn btn-sm" data-act="toggle-option" data-id="${o.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-option-${o.id}">${o.active ? 'Off' : 'On'}</button></td>
          </tr>`)}</tbody></table>`}
      </div>` : ''}
    </div>`);
    lastSel = sel.id;
  }

  const run = async (fn) => {
    if (busy) return;
    busy = true; update();
    try { await fn(); } catch { /* toasted */ }
    busy = false; update();
  };

  const move = (i, dir) => run(async () => {
    const { plist } = ctx();
    const j = i + dir;
    if (j < 0 || j >= plist.length) return;
    const arr = [...plist];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const changed = arr.map((p, k) => ({ p, order: (k + 1) * 10 })).filter((x) => x.p.displayOrder !== x.order);
    for (const c of changed) await mutate(() => api.saveParameter({ ...c.p, displayOrder: c.order })).catch(() => undefined);
  });

  const off = onAct(root, {
    retry: () => load('catalog'),
    'toggle-test': () => { const { test } = ctx(); if (test) run(() => mutate(() => api.saveTest({ ...test, active: !test.active }))); },
    'edit-test': () => { const { test, ix } = ctx(); if (test) openTestEditor({ test, ix }); },
    'quick-add': () => quickAdd(),
    'quick-focus': () => quick('name').focus(),
    'new-param': () => { const { plist } = ctx(); openParameterEditor({ testId: id, nextOrder: (plist[plist.length - 1]?.displayOrder ?? 0) + 10, taken: plist.map((p) => p.code), onSaved: (p) => { selId = p.id; update(); } }); },
    'edit-param': (el, e) => {
      e.stopPropagation();
      const { plist, ix } = ctx();
      const p = ix.paramById.get(Number(el.dataset.id));
      if (!p) return;
      const taken = plist.filter((x) => x.id !== p.id).map((x) => x.code);
      openParameterEditor({ testId: id, param: p, nextOrder: (plist[plist.length - 1]?.displayOrder ?? 0) + 10, taken, onSaved: (s) => { selId = s.id; update(); } });
    },
    'toggle-param': (el, e) => { e.stopPropagation(); const p = ctx().ix.paramById.get(Number(el.dataset.id)); if (p) run(() => mutate(() => api.saveParameter({ ...p, active: !p.active }))); },
    'sel-param': (el) => { selId = Number(el.dataset.id); update(); },
    move: (el, e) => { e.stopPropagation(); move(Number(el.dataset.i), Number(el.dataset.dir)); },
    'new-option': () => { const { sel, opts } = ctx(); if (sel) openOptionEditor({ parameterId: sel.id, nextOrder: (opts[opts.length - 1]?.sortOrder ?? 0) + 10 }); },
    'edit-option': (el) => { const { sel, opts } = ctx(); const o = opts.find((x) => x.id === Number(el.dataset.id)); if (sel && o) openOptionEditor({ parameterId: sel.id, option: o, nextOrder: (opts[opts.length - 1]?.sortOrder ?? 0) + 10 }); },
    'toggle-option': (el) => { const o = ctx().opts.find((x) => x.id === Number(el.dataset.id)); if (o) run(() => mutate(() => api.saveOption({ ...o, active: !o.active }))); },
  });
  // Enter anywhere in the quick bar adds the parameter now; the caret stays in
  // Name so the next one can be typed straight away.
  root.querySelectorAll('[data-quick]').forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); quickAdd(); }
    });
    el.addEventListener('input', () => el.classList.remove('err'));
  });
  load('catalog');
  update();
  return { update, destroy: off };
}
