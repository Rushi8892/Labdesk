import { state, load, mutate } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, dash, skeleton, empty, errorBlock, onAct, icon } from '../dom.js';
import { fmtAge, fmtRange, isApproved } from '../lab.js';
import { openTestEditor, openParameterEditor, openOptionEditor } from '../editors.js';
import { openReferenceEditor, openApproveDialog } from '../reference.js';

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
    const refs = sel ? ix.refsByParam.get(sel.id) ?? [] : [];
    const contexts = Array.from(new Set((ix?.raw.references ?? []).map((r) => r.context))).filter(Boolean);
    return { ix, test, plist, sel, opts, refs, contexts };
  };

  function update() {
    const s = state.catalog;
    const { ix, test, plist, sel, opts, refs } = ctx();
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
      ['Turnaround', test.turnaroundTime], ['Price', Number(test.price).toFixed(2)], ['Display order', String(test.displayOrder)],
      ['Report title', test.reportTitle], ['Short name', test.shortName],
    ];
    const long = [['Description', test.description], ['Patient preparation', test.patientPreparation], ['Collection', test.collectionInstructions], ['Notes', test.notes]];
    setHTML($('[data-slot="info"]'), html`${info.map(([k, v]) => html`<div><div class="lbl">${k}</div><div class="v truncate">${v || dash()}</div></div>`)}
      ${long.filter(([, v]) => v).map(([k, v]) => html`<div class="long"><div class="lbl">${k}</div><div class="xs">${v}</div></div>`)}`);

    $('[data-slot="pcount"]').textContent = String(plist.length);
    setHTML($('[data-slot="params"]'), plist.length === 0
      ? empty('No parameters yet', 'Add the first parameter to start defining what this test reports.', html`<button class="btn btn-primary" data-act="new-param">Add parameter</button>`)
      : html`<table class="tbl">
        <thead><tr><th>Order</th><th>Code</th><th>Name</th><th>Type</th><th>Unit</th><th>Ref. type</th><th>Req</th><th>Status</th><th></th></tr></thead>
        <tbody>${plist.map((p, i) => html`<tr class="click ${p.id === sel?.id ? 'sel' : ''} ${p.active ? '' : 'off'}" data-act="sel-param" data-id="${p.id}" data-testid="row-param-${p.id}">
          <td><span class="row" style="gap:2px">
            <button class="btn btn-ghost btn-icon btn-sm" data-act="move" data-i="${i}" data-dir="-1"${i === 0 || busy ? html` disabled` : ''} aria-label="Move up" data-testid="button-up-${p.id}">${icon.up(12)}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-act="move" data-i="${i}" data-dir="1"${i === plist.length - 1 || busy ? html` disabled` : ''} aria-label="Move down" data-testid="button-down-${p.id}">${icon.down(12)}</button>
            <span class="mono muted" style="margin-left:4px">${p.displayOrder}</span></span></td>
          <td class="mono sb">${p.code}</td><td class="sb">${p.name}</td><td>${p.dataType}</td>
          <td class="mono">${p.unit || '\u2014'}</td><td>${p.referenceType}</td><td>${p.required ? 'Yes' : 'No'}</td>
          <td>${pill(p.active ? 'pill-ok' : '', p.active ? 'Active' : 'Inactive')}</td>
          <td class="right nowrap">
            <button class="btn btn-sm" data-act="edit-param" data-id="${p.id}" data-testid="button-edit-param-${p.id}">Edit</button>
            <button class="btn btn-sm" data-act="toggle-param" data-id="${p.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-param-${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button>
          </td></tr>`)}</tbody></table>`);

    const aside = $('[data-slot="aside"]');
    if (!sel) { setHTML(aside, empty('Select a parameter', 'Options and reference intervals appear here.')); lastSel = null; return; }
    const num = sel.dataType === 'Numeric';
    setHTML(aside, html`<div class="scroll flex-1 ${lastSel !== sel.id ? 'pop' : ''}">
      <div class="aside-sec">
        <div class="lbl">Selected parameter</div>
        <div class="b" style="font-size:15px">${sel.name} <span class="mono muted">${sel.code}</span></div>
        <div class="xs muted" style="margin-top:4px">${sel.dataType}${sel.unit ? ` \u00b7 ${sel.unit}` : ''}${num ? ` \u00b7 decimals ${sel.decimalPlaces ?? 'any'} \u00b7 technical ${sel.technicalMin ?? '\u2212\u221e'} to ${sel.technicalMax ?? '+\u221e'} \u00b7 negative ${sel.allowNegative ? 'allowed' : 'blocked'}` : ''}</div>
        ${sel.notes ? html`<div class="xs" style="margin-top:4px">Note: ${sel.notes}</div>` : ''}
      </div>
      ${sel.dataType === 'Dropdown' ? html`<div class="aside-sec">
        <div class="hd"><div class="b">Options <span class="mono muted">${opts.length}</span></div>
          <button class="btn btn-sm btn-primary" data-act="new-option" data-testid="button-new-option">${icon.plus(12)} Add option</button></div>
        ${opts.length === 0 ? html`<div class="dash" style="color:hsl(var(--warn))">No options configured. Result entry cannot accept a value until options are added.</div>` : html`<table class="tbl">
          <thead><tr><th>Sort</th><th>Code</th><th>Label</th><th>Flag</th><th></th></tr></thead>
          <tbody>${opts.map((o) => html`<tr class="${o.active ? '' : 'off'}" data-testid="row-option-${o.id}">
            <td class="mono">${o.sortOrder}</td><td class="mono">${o.code}</td><td>${o.label}</td>
            <td>${o.abnormal ? pill('pill-warn', 'Abnormal') : dash()}</td>
            <td class="right nowrap"><button class="btn btn-sm" data-act="edit-option" data-id="${o.id}" data-testid="button-edit-option-${o.id}">Edit</button>
              <button class="btn btn-sm" data-act="toggle-option" data-id="${o.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-option-${o.id}">${o.active ? 'Off' : 'On'}</button></td>
          </tr>`)}</tbody></table>`}
      </div>` : ''}
      <div class="aside-sec">
        <div class="hd"><div class="b">Reference intervals <span class="mono muted">${refs.length}</span></div>
          <button class="btn btn-sm btn-primary" data-act="new-ref"${sel.referenceType === 'None' ? html` disabled` : ''} data-testid="button-new-reference">${icon.plus(12)} Add interval</button></div>
        ${sel.referenceType === 'None' ? html`<div class="note-warn row" style="margin-bottom:8px" data-testid="text-reftype-none">
          <span style="flex:1">This parameter's reference type is None. Edit the parameter and choose Range, Text or Decision Value before adding intervals.</span>
          <button class="btn btn-sm" data-act="edit-param" data-id="${sel.id}" data-testid="button-edit-param-reftype">Edit parameter</button></div>` : ''}
        ${refs.length === 0 ? html`<div class="dash muted">Not configured. Results will show no reference and no flag until the lab enters and approves one.</div>` : html`<div class="refcards">
          ${refs.map((r) => html`<div class="panel refcard ${r.active ? '' : 'dim'}" data-testid="card-ref-${r.id}">
            <div class="row wrap" style="gap:6px;margin-bottom:6px">${pill(isApproved(r) ? 'pill-ok' : 'pill-hatch', isApproved(r) ? 'Approved' : 'Unapproved')}${pill('', `v${r.version ?? 1}`)}${!r.active ? pill('', 'Inactive') : ''}</div>
            <div class="sb mono">${fmtRange(r)} ${r.unit ?? ''}</div>
            <div class="xs muted" style="margin-top:2px">${r.context} \u00b7 ${r.sex} \u00b7 ${fmtAge(r)}${r.effectiveFrom || r.effectiveTo ? ` \u00b7 ${r.effectiveFrom || '\u2026'} to ${r.effectiveTo || '\u2026'}` : ''}</div>
            ${isApproved(r) ? html`<div class="xxs muted">Approved by ${r.approvedBy} (typed attribution)</div>` : ''}
            <div class="row" style="gap:6px;margin-top:8px">
              ${!isApproved(r) ? html`<button class="btn btn-sm btn-primary" data-act="approve" data-id="${r.id}" data-testid="button-approve-ref-${r.id}">Approve</button>` : ''}
              <button class="btn btn-sm" data-act="edit-ref" data-id="${r.id}" data-testid="button-edit-ref-${r.id}">${isApproved(r) ? 'New version' : 'Edit'}</button>
              <button class="btn btn-sm" data-act="toggle-ref" data-id="${r.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-ref-${r.id}">${r.active ? 'Deactivate' : 'Activate'}</button>
            </div></div>`)}</div>`}
      </div></div>`);
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
    'new-param': () => { const { plist } = ctx(); openParameterEditor({ testId: id, nextOrder: (plist[plist.length - 1]?.displayOrder ?? 0) + 10, onSaved: (p) => { selId = p.id; update(); } }); },
    'edit-param': (el, e) => { e.stopPropagation(); const { plist, ix } = ctx(); const p = ix.paramById.get(Number(el.dataset.id)); if (p) openParameterEditor({ testId: id, param: p, nextOrder: (plist[plist.length - 1]?.displayOrder ?? 0) + 10, onSaved: (s) => { selId = s.id; update(); } }); },
    'toggle-param': (el, e) => { e.stopPropagation(); const p = ctx().ix.paramById.get(Number(el.dataset.id)); if (p) run(() => mutate(() => api.saveParameter({ ...p, active: !p.active }))); },
    'sel-param': (el) => { selId = Number(el.dataset.id); update(); },
    move: (el, e) => { e.stopPropagation(); move(Number(el.dataset.i), Number(el.dataset.dir)); },
    'new-option': () => { const { sel, opts } = ctx(); if (sel) openOptionEditor({ parameterId: sel.id, nextOrder: (opts[opts.length - 1]?.sortOrder ?? 0) + 10 }); },
    'edit-option': (el) => { const { sel, opts } = ctx(); const o = opts.find((x) => x.id === Number(el.dataset.id)); if (sel && o) openOptionEditor({ parameterId: sel.id, option: o, nextOrder: (opts[opts.length - 1]?.sortOrder ?? 0) + 10 }); },
    'toggle-option': (el) => { const o = ctx().opts.find((x) => x.id === Number(el.dataset.id)); if (o) run(() => mutate(() => api.saveOption({ ...o, active: !o.active }))); },
    'new-ref': () => { const { sel, contexts } = ctx(); if (sel && sel.referenceType !== 'None') openReferenceEditor({ param: sel, contexts }); },
    'edit-ref': (el) => { const { sel, refs, contexts } = ctx(); const r = refs.find((x) => x.id === Number(el.dataset.id)); if (sel && r) openReferenceEditor({ param: sel, reference: r, contexts }); },
    'toggle-ref': (el) => { const r = ctx().refs.find((x) => x.id === Number(el.dataset.id)); if (r) run(() => mutate(() => api.saveReference({ ...r, active: !r.active }))); },
    approve: (el) => { const { sel, refs } = ctx(); const r = refs.find((x) => x.id === Number(el.dataset.id)); if (sel && r) openApproveDialog({ reference: r, label: `${sel.name}: ${fmtRange(r)} (${r.context})` }); },
  });
  load('catalog');
  update();
  return { update, destroy: off };
}
