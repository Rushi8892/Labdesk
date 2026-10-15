import { state, load } from '../store.js';
import { html, setHTML, skeleton, empty, errorBlock, onAct } from '../dom.js';
import { fmtDate } from '../lab.js';

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  const f = { search: '', entity: '' };

  function update() {
    const q = state.audit;
    const data = q.data ?? [];
    const sel = $('[data-f="entity"]');
    const entities = Array.from(new Set(data.map((e) => e.entity))).sort();
    const cur = sel.value;
    setHTML(sel, html`<option value="">All entities</option>${entities.map((e) => html`<option>${e}</option>`)}`);
    sel.value = entities.includes(cur) ? cur : '';
    f.entity = sel.value;
    const t = f.search.trim().toLowerCase();
    const rows = [...data].filter((e) => (!f.entity || e.entity === f.entity) && (!t || `${e.action} ${e.actor} ${e.details}`.toLowerCase().includes(t)))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id);
    $('[data-slot="count"]').textContent = `${rows.length} events`;
    setHTML($('[data-slot="body"]'), html`
      ${q.loading ? skeleton(10) : ''}
      ${q.error ? errorBlock('audit history') : ''}
      ${q.data && rows.length === 0 ? empty('No audit events', 'Configuration and result changes will be listed here.') : ''}
      ${rows.length > 0 ? html`<table class="tbl"><thead><tr><th>When</th><th>Entity</th><th>Id</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
        <tbody>${rows.map((e) => html`<tr data-testid="row-audit-${e.id}">
          <td class="mono nowrap">${fmtDate(e.timestamp)}</td><td class="sb">${e.entity}</td><td class="mono">${e.entityId}</td>
          <td><span class="pill">${e.action}</span></td><td>${e.actor || '\u2014'}</td><td class="muted">${e.details}</td></tr>`)}</tbody></table>` : ''}`);
  }

  const off = onAct(root, { retry: () => load('audit') });
  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { f[el.dataset.f] = el.value; update(); }));
  load('audit');
  update();
  return { update, destroy: off };
}
