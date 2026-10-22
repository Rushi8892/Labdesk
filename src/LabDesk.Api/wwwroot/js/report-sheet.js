import { html, setHTML, icon, wordmark } from './dom.js';
import { fmtDate, isAbnormal } from './lab.js';

const COLUMNS = ['Parameter', 'Result', 'Unit', 'Reference / normal ranges'];

const letterhead = (lab) => html`<header class="rs-letterhead">
  <img class="rs-logo" src="${lab.logo || 'img/gs-lab-mark.png'}" alt="">
  <div>
    ${wordmark(lab.name || 'Laboratory', 30, 'text-report-lab-name')}
    ${lab.tagline ? html`<div class="rs-lab-tag">${lab.tagline}</div>` : ''}
  </div>
  ${(lab.address || lab.phone1 || lab.phone2) ? html`<div class="rs-contact" data-testid="text-report-contact">
    ${lab.address ? html`<div>${lab.address}</div>` : ''}
    ${lab.phone1 ? html`<div class="rs-phone">${icon.phone(11)}<span>${lab.phone1}</span></div>` : ''}
    ${lab.phone2 ? html`<div class="rs-phone">${icon.phone(11)}<span>${lab.phone2}</span></div>` : ''}
  </div>` : ''}
</header>`;

// Who the report is for. Printed once per document, not once per test.
const identityCells = (r) => html`<div><div class="lbl">Patient's name</div><div class="rs-v" data-testid="text-report-patient">${r.patientName}</div></div>
  <div><div class="lbl">Age / sex</div><div class="rs-v">${r.age} y \u00b7 ${r.sex}</div></div>
  <div><div class="lbl">Referred by</div><div class="rs-v">${r.doctorName || '\u2014'}</div></div>`;

// A result the lab's own reference calls abnormal prints in red, so it is obvious
// on paper without adding a flag column.
const linesTable = (lines, sex) => html`<table class="rs-tbl"><thead><tr>${COLUMNS.map((h) => html`<th>${h}</th>`)}</tr></thead>
  <tbody>${(lines || []).map((l, i) => {
    const shown = l.optionLabel || l.value;
    const bad = isAbnormal(shown, l.normalRanges, sex);
    return html`<tr data-testid="report-line-${i}">
    <td><b>${l.name}</b></td><td class="mono${bad ? ' bad-text b' : ''}"${bad ? html` data-testid="report-line-abnormal-${i}"` : ''}>${shown}</td><td class="mono">${l.unit}</td>
    <td class="mono" data-testid="report-line-ranges-${i}">${(l.normalRanges ?? []).length
      ? html`${l.normalRanges.map((line, n) => html`<div data-testid="report-line-ranges-${i}-${n}">${line}</div>`)}`
      : html`<div class="muted">Not configured</div>`}</td></tr>`;
  })}</tbody></table>`;

// Who signs the sheet. The left column is left blank on purpose: the technician
// stamps or signs it by hand after printing.
// shortcut: the stamp above the label is a shipped bitmap so a printed copy looks
// stamped; swap wwwroot/img/lab-stamp.png or drop the img when the real stamp is
// used by hand.
const signature = (lab) => html`<footer class="rs-foot" data-testid="report-footer">
  <div class="rs-sign">
    <div class="rs-sign-pad"><img class="rs-stamp" src="img/lab-stamp.png" alt="" data-testid="img-report-stamp"></div>
    <div class="rs-sign-lbl" data-testid="text-report-technician">${lab.technicianLabel || 'Lab Technician Signature'}</div>
  </div>
  ${(lab.signatoryName || lab.signatoryQualification) ? html`<div class="rs-sign right">
    <div class="rs-sign-pad"></div>
    ${lab.signatoryName ? html`<div class="rs-sign-name" data-testid="text-report-signatory">${lab.signatoryName}</div>` : ''}
    ${lab.signatoryQualification ? html`<div class="rs-sign-qual" data-testid="text-report-signatory-qualification">${lab.signatoryQualification}</div>` : ''}
  </div>` : ''}
</footer>`;

// The letterhead and patient block are one band that opens every page.
const headBand = (lab, cells) => html`<header class="rs-head" data-testid="report-head">
  ${letterhead(lab)}<div class="rs-rule"></div>
  <div class="rs-patient">${cells}</div>
</header>`;

// A page is cut here, not by the browser: a break inside a table cell loses the
// row that straddles it and a fixed band paints over the text, so each test block
// is measured inside a hidden A4 strip and grouped into pages known to fit.
const PAGE_H = 740;  // px between the letterhead and the sign-off of an A4 page
const GAP = 22;      // .rs-test margin-top
// shortcut: a single test taller than one page cannot be cut without splitting
// its table, so it overflows onto the next page. Split such a test in the catalog
// if a lab ever creates one.

const testBlock = (r) => html`<section class="rs-test" data-testid="report-test-${r.resultId}">
  <div class="rs-top">
    <div><h2>${r.reportTitle || r.testName}</h2>
      <div class="rs-meta">Collected ${fmtDate(r.collectedAt)} \u00b7 Reported ${fmtDate(r.completedAt)}</div></div>
    <div class="mono right">${r.testCode}<br>Result #${r.resultId}</div>
  </div>
  ${linesTable(r.lines, r.sex)}
</section>`;

const blockHeights = (sheets) => {
  if (!sheets.length) return [];
  const host = document.createElement('div');
  host.className = 'rs-measure';
  setHTML(host, sheets.map(testBlock));
  document.body.appendChild(host);
  const out = Array.from(host.children, (el) => el.getBoundingClientRect().height + GAP);
  host.remove();
  return out;
};

// Which page each test lands on. Without a plan a page simply fills up and the
// next test opens a new one; a plan number sends a test to exactly that page, so
// moving one test never drags the rest. `overflow` names pages that could not hold
// what was put on them, so the caller can refuse to print them.
export const layout = (sheets, plan = {}) => {
  const heights = blockHeights(sheets);
  const groups = [];
  const pages = [];
  const used = {};
  let pageNo = 1;
  const group = (n) => {
    while (groups.length < n) groups.push([]);
    return groups[n - 1];
  };

  sheets.forEach((r, i) => {
    const want = Math.round(Number(plan?.[r.resultId]));
    if (Number.isFinite(want) && want > 0) pageNo = want;
    else if ((used[pageNo] ?? 0) && (used[pageNo] ?? 0) + heights[i] > PAGE_H) pageNo += 1;
    group(pageNo).push(i);
    pages[i] = pageNo;
    used[pageNo] = (used[pageNo] ?? 0) + heights[i];
  });

  const overflow = groups.flatMap((g, i) => (g.reduce((sum, ix) => sum + heights[ix], 0) > PAGE_H ? [i + 1] : []));
  return { groups, pages, overflow };
};

const page = (lab, cells, blocks) => html`<article class="report-sheet report-page" data-testid="report-page">
  ${headBand(lab, cells)}
  ${blocks}
  ${signature(lab)}
</article>`;

// One report on its own, with its dates and result number (Reports page).
export const reportSheet = (r, lab = {}) => page(lab, html`${identityCells(r)}
  <div><div class="lbl">Collected</div><div class="rs-v">${fmtDate(r.collectedAt)}</div></div>
  <div><div class="lbl">Reported</div><div class="rs-v">${r.completedAt ? fmtDate(r.completedAt) : '\u2014'}</div></div>
  <div><div class="lbl">Result no.</div><div class="rs-v mono">#${r.resultId}</div></div>`,
  html`<section class="rs-test" data-testid="report-test-${r.resultId}">
    <div class="rs-top"><h2>${r.reportTitle || r.testName}</h2><div class="mono right">${r.testCode}<br>Result #${r.resultId}</div></div>
    ${linesTable(r.lines, r.sex)}
  </section>`);

// A patient's whole file: a letterhead and patient block on every page, a block
// per test, the sign-off at the foot. `plan` is resultId -> page number, as
// chosen on screen; without it the pages fill up on their own.
export const reportBundle = (sheets, lab = {}, plan = {}) => {
  const cells = identityCells(sheets[0] || {});
  return layout(sheets, plan).groups
    .map((group) => page(lab, cells, group.map((i) => testBlock(sheets[i]))));
};
