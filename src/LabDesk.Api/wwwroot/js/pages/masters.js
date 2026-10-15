import { state, load, mutate } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, skeleton, empty, errorBlock, onAct } from '../dom.js';
import { openMasterEditor } from '../editors.js';

const TABS = [['Category', 'Categories'], ['Specimen', 'Specimens'], ['Method', 'Methods (optional)']];
const listOf = (raw, k) => (k === 'Category' ? raw.categories : k === 'Specimen' ? raw.specimens : raw.methods);
const fk = (t, k) => (k === 'Category' ? t.categoryId : k === 'Specimen' ? t.specimenTypeId : t.methodId);

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  let kind = 'Category';
  let busy = false;

  function update() {
    const s = state.catalog;
    const ix = s.ix;
    const list = ix ? listOf(ix.raw, kind) : [];
    $('[data-slot="newlabel"]').textContent = `New ${kind.toLowerCase()}`;
    setHTML($('[data-slot="tabs"]'), TABS.map(([k, l]) => html`<button class="tab ${kind === k ? 'on' : ''}" data-act="tab" data-k="${k}" data-testid="tab-master-${k}">${l} ${ix ? html`<span class="mono" style="opacity:.6">${listOf(ix.raw, k).length}</span>` : ''}</button>`));
    setHTML($('[data-slot="body"]'), html`
      ${s.loading ? skeleton(6) : ''}
      ${s.error ? errorBlock('masters') : ''}
      ${ix && list.length === 0 ? empty(`No ${kind.toLowerCase()} entries`, 'Add one so tests can reference it.', html`<button class="btn btn-primary" data-act="new-master">Add ${kind.toLowerCase()}</button>`) : ''}
      ${ix && list.length > 0 ? html`<table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>Tests using</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((m) => html`<tr class="${m.active ? '' : 'off'}" data-testid="row-master-${m.id}">
          <td class="mono sb">${m.code}</td><td class="sb">${m.name}</td>
          <td class="mono">${ix.raw.tests.filter((t) => fk(t, kind) === m.id).length}</td>
          <td>${pill(m.active ? 'pill-ok' : '', m.active ? 'Active' : 'Inactive')}</td>
          <td class="right nowrap"><button class="btn btn-sm" data-act="edit" data-id="${m.id}" data-testid="button-edit-master-${m.id}">Edit</button>
            <button class="btn btn-sm" data-act="toggle" data-id="${m.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-master-${m.id}">${m.active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>`)}</tbody></table>` : ''}`);
  }

  const find = (id) => (state.catalog.ix ? listOf(state.catalog.ix.raw, kind).find((m) => m.id === id) : undefined);
  const off = onAct(root, {
    tab: (el) => { kind = el.dataset.k; update(); },
    'new-master': () => openMasterEditor({ kind }),
    edit: (el) => { const m = find(Number(el.dataset.id)); if (m) openMasterEditor({ kind, master: m }); },
    toggle: async (el) => {
      const m = find(Number(el.dataset.id));
      if (!m || busy) return;
      busy = true; update();
      try { await mutate(() => api.saveMaster({ ...m, kind, active: !m.active })); } catch { /* toasted */ }
      busy = false; update();
    },
    retry: () => load('catalog'),
  });
  load('catalog');
  update();
  return { update, destroy: off };
}
