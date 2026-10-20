import { state, load } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, dash, skeleton, empty, errorBlock, onAct, toast } from '../dom.js';
import { fmtDate, statusTone } from '../lab.js';
import { reportSheet } from '../report-sheet.js';

// Every test this patient has had, and their reports bundled into one file to hand over.
export function mount(root, params) {
  const id = Number(params.id);
  const $ = (s) => root.querySelector(s);
  // Reports on screen: one from a click, or all of them while saving a bundle.
  const pane = { ids: [], sheets: [], loading: false, error: null, seq: 0 };
  let selId = null;
  let busy = false;

  const patient = () => (state.patients.data ?? []).find((p) => p.id === id);
  const mine = () => (state.results.data ?? []).filter((r) => r.patientId === id).sort((a, b) => b.id - a.id);
  const reported = () => mine().filter((r) => r.status === 'Completed');

  async function loadSheets(ids) {
    const seq = ++pane.seq;
    Object.assign(pane, { ids, sheets: [], loading: true, error: null });
    renderPane();
    try {
      const sheets = [];
      for (const rid of ids) sheets.push(await api.report(rid));
      if (seq !== pane.seq) return null;
      pane.sheets = sheets;
    } catch (e) {
      if (seq !== pane.seq) return null;
      pane.error = e;
    }
    pane.loading = false;
    renderPane();
    return pane.sheets.length ? pane.sheets : null;
  }

  function renderPane() {
    const host = $('[data-slot="report"]');
    if (pane.loading) return setHTML(host, skeleton(10));
    if (pane.error) return setHTML(host, errorBlock('the report snapshots', 'retry-report'));
    if (!pane.sheets.length) {
      const done = reported().length;
      return setHTML(host, empty(done ? 'Select a report' : 'No reports yet',
        done ? 'Click a completed test on the left, or save all of them as one PDF.' : 'A report can be saved once a result is completed.'));
    }
    const lab = state.lab.data || {};
    setHTML(host, html`${pane.sheets.map((r) => reportSheet(r, lab))}`);
  }

  function update() {
    const ps = state.patients;
    const rs = state.results;
    const pt = patient();
    const list = mine();
    const done = reported().length;
    const stateEl = $('[data-slot="state"]');
    const content = $('[data-slot="content"]');
    let st = null;
    if ((ps.loading && !ps.data) || (rs.loading && !rs.data)) st = skeleton(12);
    else if (ps.error || rs.error) st = errorBlock('this patient', 'retry');
    else if (!pt) st = empty('Patient not found', '', html`<a href="#/patients" class="btn">Back to patients</a>`);
    stateEl.hidden = !st;
    content.hidden = !!st;
    if (st) { setHTML(stateEl, st); return; }

    $('[data-slot="title"]').textContent = pt.name;
    $('[data-slot="sub"]').textContent = `${list.length} test${list.length === 1 ? '' : 's'} \u00b7 ${list.length - done} draft \u00b7 ${done} completed`;
    $('[data-act="save-all"]').disabled = busy || done === 0;
    setHTML($('[data-slot="info"]'), html`${[
      ['Age', `${pt.age} y`], ['Sex', pt.sex], ['Phone', pt.phone], ['Referred by', pt.doctorName], ['Reports', String(done)],
    ].map(([k, v]) => html`<div><div class="lbl">${k}</div><div class="v truncate">${v || dash()}</div></div>`)}`);
    setHTML($('[data-slot="list"]'), html`
      ${rs.loading ? skeleton(6) : ''}
      ${rs.data && list.length === 0 ? empty('No tests yet', 'Start a result for this patient from the Results page.', html`<a href="#/results" class="btn">Go to results</a>`) : ''}
      ${list.length ? html`<table class="tbl"><tbody>${list.map((r) => {
        const ready = r.status === 'Completed';
        return html`<tr class="${ready ? 'click' : ''} ${r.id === selId ? 'sel' : ''}" ${ready ? html`data-act="sel" data-id="${r.id}"` : ''} data-testid="row-patient-test-${r.id}">
          <td><div class="sb">${r.testName}</div><div class="xxs muted">${fmtDate(r.collectedAt)}${ready ? ` \u00b7 reported ${fmtDate(r.completedAt)}` : ''}</div></td>
          <td class="right">${pill(statusTone(r.status), r.status)}</td></tr>`;
      })}</tbody></table>` : ''}`);
    // The empty-pane wording depends on how many reports exist, so refresh it
    // once the worklist arrives. A sheet already on screen is left alone.
    if (!pane.sheets.length) renderPane();
  }

  // The letterhead logo must be decoded before the print dialog opens, or it prints blank.
  const imagesReady = (el) => Promise.all([...el.querySelectorAll('img')]
    .map((i) => i.complete || new Promise((res) => { i.onload = i.onerror = res; })));

  async function saveAll() {
    // Oldest first, so the file reads as a history of this patient.
    const ids = [...reported()].sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')).map((r) => r.id);
    busy = true;
    selId = null;
    update();
    const sheets = await loadSheets(ids);
    busy = false;
    update();
    if (!sheets) return;
    toast('Choose "Save as PDF"', `${sheets.length} report${sheets.length === 1 ? '' : 's'} in one file.`);
    await imagesReady($('[data-slot="report"]'));
    window.print();
  }

  const off = onAct(root, {
    sel: (el) => { selId = Number(el.dataset.id); update(); loadSheets([selId]); },
    'save-all': () => { if (!busy) saveAll(); },
    retry: () => { load('patients'); load('results'); },
    'retry-report': () => loadSheets(pane.ids),
  });
  load('patients');
  load('results');
  load('lab').then(() => { if (pane.sheets.length) renderPane(); });
  update();
  renderPane();
  return { update, destroy: off };
}
