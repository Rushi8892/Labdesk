import { state, load } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, dash, skeleton, empty, errorBlock, onAct, toast } from '../dom.js';
import { fmtDate, statusTone } from '../lab.js';
import { reportBundle, layout } from '../report-sheet.js';

// Every test this patient has had, and their reports bundled into one file to hand over.
export function mount(root, params) {
  const id = Number(params.id);
  const $ = (s) => root.querySelector(s);
  // Reports on screen: one from a click, or all of them while saving a bundle.
  const pane = { ids: [], sheets: [], loading: false, error: null, seq: 0 };
  let selId = null;
  let busy = false;
  // resultId -> page the user put that test on. Empty means "lay it out for me".
  let plan = {};
  let planSheets = [];

  const patient = () => (state.patients.data ?? []).find((p) => p.id === id);
  const mine = () => (state.results.data ?? []).filter((r) => r.patientId === id).sort((a, b) => b.id - a.id);
  const reported = () => mine().filter((r) => r.status === 'Completed');
  // Oldest first, so the file reads as a history of this patient.
  const reportedIds = () => [...reported()].sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')).map((r) => r.id);

  // The page every test prints on, plus the pages that cannot hold what they were
  // given or that no test was put on, so the screen can say so before printing.
  function pagePlan() {
    if (!planSheets.length) return { pages: {}, overflow: [], blank: [], count: 0 };
    const l = layout(planSheets, plan);
    const pages = {};
    planSheets.forEach((s, i) => { pages[s.resultId] = l.pages[i]; });
    return {
      pages,
      overflow: l.overflow,
      blank: l.groups.flatMap((g, i) => (g.length ? [] : [i + 1])),
      count: l.groups.length,
    };
  }

  async function loadBundle() {
    const ids = reportedIds();
    if (!ids.length) return [];
    const sheets = await loadSheets(ids);
    if (sheets) {
      planSheets = sheets;
      update();
    }
    return planSheets;
  }

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
    // The page plan only shapes the whole file; a single test always prints alone.
    setHTML(host, reportBundle(pane.sheets, lab, pane.sheets.length === planSheets.length ? plan : {}));
  }

  function update() {
    const ps = state.patients;
    const rs = state.results;
    const pt = patient();
    const list = mine();
    const done = reported().length;
    const pp = pagePlan();
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
    $('[data-slot="sub"]').textContent = `${list.length} test${list.length === 1 ? '' : 's'} \u00b7 ${list.length - done} draft \u00b7 ${done} completed`
      + (pp.count ? ` \u00b7 ${pp.count} page${pp.count === 1 ? '' : 's'}` : '');
    $('[data-act="save-all"]').disabled = busy || done === 0 || pp.overflow.length > 0;
    const warn = $('[data-slot="pages-warn"]');
    warn.hidden = !pp.overflow.length && !pp.blank.length;
    const names = (ns) => `Page${ns.length > 1 ? 's' : ''} ${ns.join(', ')}`;
    warn.textContent = pp.overflow.length
      ? `${names(pp.overflow)} ${pp.overflow.length > 1 ? 'are' : 'is'} too full - move a test to another page`
      : pp.blank.length ? `${names(pp.blank)} ${pp.blank.length > 1 ? 'have' : 'has'} no tests` : '';
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
          <td class="right pg-cell">${ready ? html`<input class="input pg no-print" type="number" inputmode="numeric" min="1" max="99"
            value="${pp.pages[r.id] ?? 1}" data-page="${r.id}" data-testid="page-test-${r.id}"${planSheets.length ? '' : html` disabled`}
            aria-label="Page for ${r.testName}" title="Page this test prints on">` : ''}</td>
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
    const ids = reportedIds();
    busy = true;
    selId = null;
    update();
    if (planSheets.length !== ids.length) await loadBundle();
    else {
      pane.ids = ids;
      pane.sheets = planSheets;
      renderPane();
    }
    busy = false;
    update();
    if (!planSheets.length) return;
    const pp = pagePlan();
    if (pp.overflow.length) {
      toast('Not printed', 'A page is too full - move a test to another page.', true);
      return;
    }
    toast('Choose "Save as PDF"', `${planSheets.length} report${planSheets.length === 1 ? '' : 's'} on ${pp.count} page${pp.count === 1 ? '' : 's'}.`);
    await imagesReady($('[data-slot="report"]'));
    window.print();
  }

  // A page number is chosen in the list; it commits when the field is left. The
  // click must not fall through to the row, which opens that test on its own.
  const keepClick = (e) => { if (e.target.closest('[data-page]')) e.stopPropagation(); };
  const setPage = (e) => {
    const el = e.target.closest('[data-page]');
    if (!el) return;
    const rid = Number(el.dataset.page);
    const n = Math.round(Number(el.value));
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      el.value = pagePlan().pages[rid] ?? 1;
      return;
    }
    // Freeze the pages as they are, so moving this one test leaves the others
    // where the user saw them instead of shifting the rest of the file.
    const pp = pagePlan();
    planSheets.forEach((s) => { plan[s.resultId] = plan[s.resultId] ?? pp.pages[s.resultId]; });
    plan[rid] = n;
    // Show the whole file again, so the page the test moved to is on screen.
    pane.ids = planSheets.map((s) => s.resultId);
    pane.sheets = planSheets;
    selId = null;
    renderPane();
    update();
  };
  root.addEventListener('click', keepClick, true);
  root.addEventListener('change', setPage);

  const off = onAct(root, {
    sel: (el) => { selId = Number(el.dataset.id); update(); loadSheets([selId]); },
    'save-all': () => { if (!busy) saveAll(); },
    retry: () => { load('patients'); load('results'); },
    'retry-report': () => loadSheets(pane.ids),
  });
  load('patients');
  load('results').then(() => { if (!busy && reported().length) loadBundle(); });
  load('lab').then(() => { if (pane.sheets.length) renderPane(); });
  update();
  renderPane();
  return {
    update,
    destroy: () => {
      off();
      root.removeEventListener('click', keepClick, true);
      root.removeEventListener('change', setPage);
    },
  };
}
