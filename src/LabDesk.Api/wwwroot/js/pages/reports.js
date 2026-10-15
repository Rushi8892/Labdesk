import { state, load } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, skeleton, empty, errorBlock, onAct } from '../dom.js';
import { fmtDate } from '../lab.js';

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  let search = '';
  let sel = null;
  const rep = { id: 0, loading: false, error: null, data: null, seq: 0 };

  async function fetchReport(id) {
    const seq = ++rep.seq;
    Object.assign(rep, { id, loading: true, error: null, data: null });
    renderReport();
    try {
      const d = await api.report(id);
      if (seq !== rep.seq) return;
      rep.data = d;
    } catch (e) {
      if (seq !== rep.seq) return;
      rep.error = e;
    }
    rep.loading = false;
    renderReport();
  }

  function renderReport() {
    const r = rep.data;
    $('[data-act="print"]').disabled = !r;
    const host = $('[data-slot="report"]');
    if (!rep.id) return setHTML(host, empty('Select a completed report'));
    if (rep.loading) return setHTML(host, skeleton(10));
    if (rep.error) return setHTML(host, errorBlock('the report snapshot', 'retry-report'));
    if (!r) return setHTML(host, '');
    setHTML(host, html`<article class="report-sheet pop" data-testid="report-sheet">
      <div class="rs-top"><h2>${r.reportTitle || r.testName}</h2><div class="mono right">${r.testCode}<br>Result #${r.resultId}</div></div>
      <div class="rs-meta">
        <div>Patient: <b>${r.patientName}</b></div><div>Test: <b>${r.testName}</b></div>
        <div>Age / sex: <b>${r.age} y \u00b7 ${r.sex}</b></div><div>Collected: <b>${fmtDate(r.collectedAt)}</b></div>
        <div>Completed: <b>${fmtDate(r.completedAt)}</b></div>
      </div>
      <table class="rs-tbl"><thead><tr>${['Parameter', 'Result', 'Unit', 'Reference', 'Flag'].map((h) => html`<th>${h}</th>`)}</tr></thead>
        <tbody>${(r.lines || []).map((l) => html`<tr data-testid="report-line-${l.parameterId}">
          <td><b>${l.name}</b></td><td class="mono">${l.optionLabel || l.value}</td><td class="mono">${l.unit}</td>
          <td class="mono">${l.referenceText}</td><td class="sb">${l.flag}</td></tr>`)}</tbody></table>
    </article>`);
  }

  function update() {
    const res = state.results;
    const t = search.trim().toLowerCase();
    const completed = (res.data ?? []).filter((r) => r.status === 'Completed' && (!t || `${r.patientName} ${r.testName}`.toLowerCase().includes(t)))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    setHTML($('[data-slot="list"]'), html`
      ${res.loading ? skeleton(8) : ''}
      ${res.error ? errorBlock('results') : ''}
      ${res.data && completed.length === 0 ? empty('No completed reports', 'Completed results appear here.') : ''}
      <table class="tbl"><tbody>${completed.map((x) => html`<tr class="click ${x.id === sel ? 'sel' : ''}" data-act="sel" data-id="${x.id}" data-testid="row-report-${x.id}">
        <td><div class="sb">${x.patientName}</div></td>
        <td><div>${x.testName}</div><div class="xxs muted">${fmtDate(x.completedAt)}</div></td></tr>`)}</tbody></table>`);
  }

  const off = onAct(root, {
    sel: (el) => { sel = Number(el.dataset.id); update(); fetchReport(sel); },
    retry: () => load('results'),
    'retry-report': () => { if (rep.id) fetchReport(rep.id); },
    print: () => { if (rep.data) window.print(); },
  });
  $('[data-f="search"]').addEventListener('input', (e) => { search = e.target.value; update(); });
  load('results');
  update();
  renderReport();
  return { update, destroy: off };
}
