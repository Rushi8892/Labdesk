import { state, load } from '../store.js';
import { html, setHTML, pill, skeleton, empty, errorBlock, onAct } from '../dom.js';
import { fmtDate, statusTone, dayKey } from '../lab.js';
import { mountResultEntry } from '../result-entry.js';
import { mountMultiEntry } from '../multi-entry.js';

const STATUSES = ['Draft', 'Completed'];

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  let sel = null;
  let status = '';
  let search = '';
  let date = dayKey(new Date());
  let entryKey = null;
  let entry = null;

  function update() {
    const res = state.results;
    const ix = state.catalog.ix;
    const data = res.data;
    // The date filter narrows the worklist first, so the status counts and the
    // "n results" line describe what is on screen.
    const onDay = (data ?? []).filter((r) => !date || dayKey(r.collectedAt) === date);
    const counts = {};
    onDay.forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
    $('[data-slot="sub"]').textContent = data ? `${onDay.length} results \u00b7 ${counts.Draft ?? 0} draft \u00b7 ${counts.Completed ?? 0} completed` : 'Loading worklist';
    $('[data-act="new-result"]').disabled = !ix;
    setHTML($('[data-slot="filters"]'), ['', ...STATUSES].map((st) => html`<button class="btn btn-sm ${status === st ? 'btn-ink' : ''}" data-act="status" data-st="${st}" data-testid="filter-status-${st || 'all'}">${st || 'All'}${st ? ` ${counts[st] ?? 0}` : ''}</button>`));
    const t = search.trim().toLowerCase();
    const rows = onDay.filter((r) => (!status || r.status === status) && (!t || `${r.patientName} ${r.testName}`.toLowerCase().includes(t))).sort((a, b) => b.id - a.id);
    const none = !data || rows.length > 0 ? '' : data.length === 0
      ? empty('Worklist is empty', 'Start a new result to enter values against any configured test.')
      : onDay.length === 0
        ? empty('Nothing on this date', 'Pick another date or choose All dates.')
        : empty('Nothing matches');
    setHTML($('[data-slot="list"]'), html`
      ${res.loading ? skeleton(9) : ''}
      ${res.error ? errorBlock('the worklist') : ''}
      ${none}
      <table class="tbl"><tbody>${rows.map((r) => html`<tr class="click ${r.id === sel ? 'sel' : ''}" data-act="sel" data-id="${r.id}" data-testid="row-result-${r.id}">
        <td><div class="sb">${r.patientName}</div></td>
        <td><div>${r.testName}</div><div class="xxs muted">${fmtDate(r.collectedAt)}</div></td>
        <td>${pill(statusTone(r.status), r.status)}</td></tr>`)}</tbody></table>`);

    const current = typeof sel === 'number' ? data?.find((r) => r.id === sel) : undefined;
    const ready = !!state.patients.data;
    const show = ix && ready && sel !== null && (sel === 'new' || current);
    const key = !show ? 'none' : sel === 'new' ? 'new' : `${current.id}-${current.status}-${current.updatedAt ?? ''}`;
    if (key === entryKey) return;
    entryKey = key;
    if (entry) entry.destroy();
    entry = null;
    const host = $('[data-slot="entry"]');
    if (!show) {
      // A result names a registered patient, so entry waits for the register.
      if (sel !== null && state.patients.error) setHTML(host, errorBlock('the patient list'));
      else if (sel !== null && !ready) setHTML(host, empty('Loading patients\u2026', 'A result is entered against a patient from the register.'));
      else setHTML(host, empty('Select a result or start a new one', 'Fields, validation and normal ranges come from the test configuration.'));
      return;
    }
    const fresh = document.createElement('div');
    fresh.style.height = '100%';
    host.replaceChildren(fresh);
    entry = sel === 'new'
      ? mountMultiEntry(fresh, { liveIx: ix, onSaved: () => { sel = null; update(); } })
      : mountResultEntry(fresh, { result: current, liveIx: ix, onSaved: (id) => { sel = id; update(); } });
  }

  const off = onAct(root, {
    'new-result': () => { if (state.catalog.ix) { sel = 'new'; update(); } },
    status: (el) => { status = el.dataset.st; update(); },
    sel: (el) => { sel = Number(el.dataset.id); update(); },
    'date-all': () => { date = ''; $('[data-f="date"]').value = ''; update(); },
    retry: () => { if (state.patients.error) load('patients'); else load('results'); },
  });
  $('[data-f="search"]').addEventListener('input', (e) => { search = e.target.value; update(); });
  $('[data-f="date"]').value = date;
  $('[data-f="date"]').addEventListener('input', (e) => { date = e.target.value; update(); });
  load('results');
  load('catalog');
  load('patients');
  update();
  return { update, destroy() { off(); if (entry) entry.destroy(); } };
}
