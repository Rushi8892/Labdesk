import { state, load, mutate } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, dash, skeleton, empty, errorBlock, onAct, fillSelect } from '../dom.js';
import { readiness } from '../lab.js';
import { openTestEditor } from '../editors.js';

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  const f = { search: '', cat: '', spec: '', act: '' };
  let busy = false;

  const create = () => {
    const ix = state.catalog.ix;
    if (ix) openTestEditor({ ix, onSaved: (t) => { location.hash = `#/tests/${t.id}`; } });
  };

  function update() {
    const s = state.catalog;
    const ix = s.ix;
    $('[data-act="new-test"]').disabled = !ix;
    if (ix) {
      const r = ix.raw;
      const approved = r.references.filter((x) => x.approvedBy).length;
      setHTML($('[data-slot="sub"]'), html`<span data-testid="text-catalog-summary">${r.tests.length} tests \u00b7 ${r.parameters.length} parameters \u00b7 ${r.options.length} options \u00b7 ${approved} approved / ${r.references.length - approved} unapproved references</span>`);
      fillSelect($('[data-f="cat"]'), 'All categories', r.categories.map((m) => ({ value: m.id, label: m.name })));
      fillSelect($('[data-f="spec"]'), 'All specimens', r.specimens.map((m) => ({ value: m.id, label: m.name })));
      f.cat = $('[data-f="cat"]').value;
      f.spec = $('[data-f="spec"]').value;
    }
    const q = f.search.trim().toLowerCase();
    const rows = !ix ? [] : [...ix.raw.tests]
      .filter((t) => (!f.cat || t.categoryId === Number(f.cat)) && (!f.spec || t.specimenTypeId === Number(f.spec)) && (!f.act || String(t.active) === f.act) &&
        (!q || `${t.code} ${t.name} ${t.shortName ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    $('[data-slot="count"]').textContent = `${rows.length} shown`;
    const any = ix ? ix.raw.tests.length : 0;
    setHTML($('[data-slot="body"]'), html`
      ${s.loading ? skeleton(12) : ''}
      ${s.error ? errorBlock('the catalog') : ''}
      ${ix && rows.length === 0 ? empty(any ? 'No tests match these filters' : 'No tests defined', any ? '' : 'Create a test, then add parameters, options and references.',
        !any ? html`<button class="btn btn-primary" data-act="new-test">New test</button>` : '') : ''}
      ${ix && rows.length > 0 ? html`<table class="tbl">
        <thead><tr><th>Code</th><th>Test</th><th>Category</th><th>Specimen</th><th>Method</th><th>Params</th><th>Configuration</th><th>Price</th><th>Active</th></tr></thead>
        <tbody>${rows.map((t) => {
          const r = readiness(t, ix);
          return html`<tr class="click ${t.active ? '' : 'off'}" data-act="open" data-id="${t.id}" data-testid="row-test-${t.id}">
            <td class="mono sb">${t.code}</td>
            <td><div class="sb">${t.name}</div>${t.shortName ? html`<div class="xxs muted">${t.shortName}</div>` : ''}</td>
            <td>${ix.cat.get(t.categoryId)?.name ?? '\u2014'}</td>
            <td>${ix.spec.get(t.specimenTypeId)?.name ?? '\u2014'}</td>
            <td>${t.methodId ? ix.meth.get(t.methodId)?.name ?? '\u2014' : dash()}</td>
            <td class="mono">${r.params}</td>
            <td><div class="row gap4 wrap">${r.params === 0 ? pill('pill-warn', 'No parameters') : html`
              ${pill(r.needRef === 0 || r.withRef === r.needRef ? 'pill-ok' : 'pill-hatch', `Refs ${r.withRef}/${r.needRef}`)}
              ${r.dropNoOpts > 0 ? pill('pill-warn', `${r.dropNoOpts} dropdown no options`) : ''}
              ${r.unapproved > 0 ? pill('pill-hatch', `${r.unapproved} unapproved`) : ''}`}</div></td>
            <td class="mono">${Number(t.price).toFixed(2)}</td>
            <td><button class="btn btn-sm ${t.active ? '' : 'btn-ghost'}" data-act="toggle" data-id="${t.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-test-${t.id}">${t.active ? 'Active' : 'Inactive'}</button></td>
          </tr>`;
        })}</tbody></table>` : ''}`);
  }

  const off = onAct(root, {
    'new-test': create,
    retry: () => load('catalog'),
    open: (el) => { location.hash = `#/tests/${el.dataset.id}`; },
    toggle: async (el, e) => {
      e.stopPropagation();
      const t = state.catalog.ix?.testById.get(Number(el.dataset.id));
      if (!t || busy) return;
      busy = true; update();
      try { await mutate(() => api.saveTest({ ...t, active: !t.active })); } catch { /* toasted */ }
      busy = false; update();
    },
  });
  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { f[el.dataset.f] = el.value; update(); }));
  load('catalog');
  update();
  return { update, destroy: off };
}
