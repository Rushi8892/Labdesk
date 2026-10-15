import { state, load, mutate } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, skeleton, empty, errorBlock, onAct, fillSelect } from '../dom.js';
import { fmtAge, fmtRange, isApproved } from '../lab.js';
import { openReferenceEditor, openApproveDialog } from '../reference.js';

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  const f = { search: '', status: 'unapproved', test: '' };
  let busy = false;

  function update() {
    const s = state.catalog;
    const ix = s.ix;
    const total = ix?.raw.references.length ?? 0;
    const un = ix?.raw.references.filter((r) => !isApproved(r)).length ?? 0;
    setHTML($('[data-slot="sub"]'), ix ? html`<span data-testid="text-ref-summary">${total} intervals \u00b7 ${un} awaiting approval \u00b7 ${total - un} approved. All entered by the lab.</span>` : 'Loading');
    if (ix) { fillSelect($('[data-f="test"]'), 'All tests', ix.raw.tests.map((t) => ({ value: t.id, label: `${t.code} \u00b7 ${t.name}` }))); f.test = $('[data-f="test"]').value; }
    const t = f.search.trim().toLowerCase();
    const rows = !ix ? [] : ix.raw.references.map((r) => ({ r, p: ix.paramById.get(r.parameterId) })).filter((x) => x.p)
      .map((x) => ({ ...x, t: ix.testById.get(x.p.testId) }))
      .filter((x) => (!f.test || x.p.testId === Number(f.test)) &&
        (f.status === 'all' || (f.status === 'unapproved' && !isApproved(x.r)) || (f.status === 'approved' && isApproved(x.r)) || (f.status === 'inactive' && !x.r.active)) &&
        (!t || `${x.p.name} ${x.p.code} ${x.t?.name ?? ''} ${x.r.context}`.toLowerCase().includes(t)));
    setHTML($('[data-slot="body"]'), html`
      ${s.loading ? skeleton(8) : ''}
      ${s.error ? errorBlock('references') : ''}
      ${ix && rows.length === 0 ? empty(total === 0 ? 'No reference intervals configured' : 'Nothing matches', total === 0 ? 'The starter catalog has none. Open a test, select a parameter and add the intervals your lab uses. Until then results show Not configured.' : '') : ''}
      ${rows.length > 0 ? html`<table class="tbl">
        <thead><tr><th>Status</th><th>Test / parameter</th><th>Context</th><th>Sex</th><th>Age</th><th>Interval</th><th>Effective</th><th>Approval</th><th></th></tr></thead>
        <tbody>${rows.map(({ r, p, t: test }) => html`<tr class="${r.active ? '' : 'off'}" data-testid="row-ref-${r.id}">
          <td>${pill(isApproved(r) ? 'pill-ok' : 'pill-hatch', isApproved(r) ? 'Approved' : 'Unapproved')} ${pill('', `v${r.version ?? 1}`)}</td>
          <td><a href="#/tests/${p.testId}" class="sb link">${p.name}</a><div class="xxs muted">${test?.code ?? ''} \u00b7 ${test?.name ?? ''}</div></td>
          <td>${r.context}</td><td>${r.sex}</td><td class="mono">${fmtAge(r)}</td>
          <td class="mono">${fmtRange(r)} ${r.unit ?? ''}</td>
          <td class="mono">${r.effectiveFrom || '\u2026'} to ${r.effectiveTo || '\u2026'}</td>
          <td class="xs">${isApproved(r) ? r.approvedBy : '\u2014'}</td>
          <td class="right nowrap">
            ${!isApproved(r) ? html`<button class="btn btn-sm btn-primary" data-act="approve" data-id="${r.id}" data-testid="button-approve-ref-${r.id}">Approve</button>` : ''}
            <button class="btn btn-sm" data-act="edit" data-id="${r.id}" data-testid="button-edit-ref-${r.id}">${isApproved(r) ? 'New version' : 'Edit'}</button>
            <button class="btn btn-sm" data-act="toggle" data-id="${r.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-ref-${r.id}">${r.active ? 'Deactivate' : 'Activate'}</button>
          </td></tr>`)}</tbody></table>` : ''}`);
  }

  const find = (id) => state.catalog.ix?.raw.references.find((r) => r.id === id);
  const contexts = () => Array.from(new Set((state.catalog.ix?.raw.references ?? []).map((r) => r.context))).filter(Boolean);
  const off = onAct(root, {
    retry: () => load('catalog'),
    approve: (el) => {
      const r = find(Number(el.dataset.id));
      const p = r && state.catalog.ix.paramById.get(r.parameterId);
      if (p) openApproveDialog({ reference: r, label: `${p.name}: ${fmtRange(r)} (${r.context})` });
    },
    edit: (el) => {
      const r = find(Number(el.dataset.id));
      const p = r && state.catalog.ix.paramById.get(r.parameterId);
      if (p) openReferenceEditor({ param: p, reference: r, contexts: contexts() });
    },
    toggle: async (el) => {
      const r = find(Number(el.dataset.id));
      if (!r || busy) return;
      busy = true; update();
      try { await mutate(() => api.saveReference({ ...r, active: !r.active })); } catch { /* toasted */ }
      busy = false; update();
    },
  });
  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { f[el.dataset.f] = el.value; update(); }));
  load('catalog');
  update();
  return { update, destroy: off };
}
