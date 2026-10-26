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
// on paper without adding a flag column. Parameters that share a section print
// under one heading, in display order, the way a urine or stool report reads.
const linesTable = (lines, sex) => {
  const all = lines || [];
  return html`<table class="rs-tbl"><thead><tr>${COLUMNS.map((h) => html`<th>${h}</th>`)}</tr></thead>
  <tbody>${all.map((l, i) => {
    const head = l.section && l.section !== all[i - 1]?.section
      ? html`<tr class="rs-sec"><td colspan="${COLUMNS.length}" data-testid="report-section-${i}">${l.section}</td></tr>`
      : '';
    const shown = l.optionLabel || l.value;
    const bad = isAbnormal(shown, l.normalRanges, sex);
    return html`${head}<tr data-testid="report-line-${i}">
    <td><b>${l.name}</b></td><td class="mono${bad ? ' bad-text b' : ''}"${bad ? html` data-testid="report-line-abnormal-${i}"` : ''}>${shown}</td><td class="mono">${l.unit}</td>
    <td class="mono" data-testid="report-line-ranges-${i}">${(l.normalRanges ?? []).length
      ? html`${l.normalRanges.map((line, n) => html`<div data-testid="report-line-ranges-${i}-${n}">${line}</div>`)}`
      : html`<div class="muted">Not configured</div>`}</td></tr>`;
  })}</tbody></table>`;
};

// Who signs the sheet. Both columns are left blank on purpose: the technician
// stamps or signs it by hand after printing.
const signature = (lab) => html`<footer class="rs-foot" data-testid="report-footer">
  <div class="rs-sign">
    <div class="rs-sign-pad"></div>
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

const title = (r, continued) => `${r.reportTitle || r.testName}${continued ? ' (continued)' : ''}`;

const testBlock = (r, lines = r.lines, continued = false) => html`<section class="rs-test" data-testid="report-test-${r.resultId}">
  <div class="rs-top">
    <div><h2>${title(r, continued)}</h2>
      <div class="rs-meta">Collected ${fmtDate(r.collectedAt)} \u00b7 Reported ${fmtDate(r.completedAt)}</div></div>
    <div class="mono right">${r.testCode}<br>Result #${r.resultId}</div>
  </div>
  ${linesTable(lines, r.sex)}
</section>`;

// The same block for a single report, whose patient band already carries the dates.
const oneBlock = (r, lines = r.lines, continued = false) => html`<section class="rs-test" data-testid="report-test-${r.resultId}">
  <div class="rs-top"><h2>${title(r, continued)}</h2><div class="mono right">${r.testCode}<br>Result #${r.resultId}</div></div>
  ${linesTable(lines, r.sex)}
</section>`;

const measure = (blocks) => {
  if (!blocks.length) return [];
  const host = document.createElement('div');
  host.className = 'rs-measure';
  setHTML(host, blocks);
  document.body.appendChild(host);
  const out = Array.from(host.children, (el) => el.getBoundingClientRect().height + GAP);
  host.remove();
  return out;
};

// A test taller than one page (stool) is cut at row boundaries into pieces that
// fit, so every page still opens with the letterhead and closes with the sign-off.
const chunksOf = (r, build) => {
  const lines = r.lines ?? [];
  const fits = (part) => measure([build(r, part)])[0] <= PAGE_H;
  if (fits(lines)) return [{ sheet: r, lines, continued: false }];
  const out = [];
  let from = 0;
  while (from < lines.length) {
    let lo = from + 1, hi = lines.length, best = from + 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(lines.slice(from, mid))) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    out.push({ sheet: r, lines: lines.slice(from, best), continued: from > 0 });
    from = best;
  }
  return out;
};

// Which page each test lands on. Without a plan a page simply fills up and the
// next test opens a new one; a plan number sends a test to exactly that page, so
// moving one test never drags the rest. `overflow` names pages that could not hold
// what was put on them, so the caller can refuse to print them.
export const layout = (sheets, plan = {}, build = testBlock) => {
  const blocks = sheets.flatMap((sheet, index) => chunksOf(sheet, build).map((c) => ({ ...c, index })));
  measure(blocks.map((b) => build(b.sheet, b.lines, b.continued))).forEach((h, i) => { blocks[i].h = h; });
  const groups = [];
  const pages = [];
  const used = {};
  let pageNo = 1;
  const group = (n) => {
    while (groups.length < n) groups.push([]);
    return groups[n - 1];
  };

  blocks.forEach((b, i) => {
    if (b.index !== blocks[i - 1]?.index) {
      const want = Math.round(Number(plan?.[b.sheet.resultId]));
      if (Number.isFinite(want) && want > 0) pageNo = want;
      else if ((used[pageNo] ?? 0) && (used[pageNo] ?? 0) + b.h > PAGE_H) pageNo += 1;
      pages[b.index] = pageNo;
    } else if ((used[pageNo] ?? 0) + b.h > PAGE_H) {
      pageNo += 1;
    }
    group(pageNo).push(b);
    used[pageNo] = (used[pageNo] ?? 0) + b.h;
  });

  const overflow = groups.flatMap((g, i) => (g.reduce((sum, b) => sum + b.h, 0) > PAGE_H ? [i + 1] : []));
  return { groups, pages, overflow };
};

const page = (lab, cells, blocks) => html`<article class="report-sheet report-page" data-testid="report-page">
  ${headBand(lab, cells)}
  ${blocks}
  ${signature(lab)}
</article>`;

// One report on its own, with its dates and result number (Reports page).
export const reportSheet = (r, lab = {}) => {
  const cells = html`${identityCells(r)}
  <div><div class="lbl">Collected</div><div class="rs-v">${fmtDate(r.collectedAt)}</div></div>
  <div><div class="lbl">Reported</div><div class="rs-v">${r.completedAt ? fmtDate(r.completedAt) : '\u2014'}</div></div>
  <div><div class="lbl">Result no.</div><div class="rs-v mono">#${r.resultId}</div></div>`;
  return layout([r], {}, oneBlock).groups
    .map((group) => page(lab, cells, group.map((b) => oneBlock(b.sheet, b.lines, b.continued))));
};

// A patient's whole file: a letterhead and patient block on every page, a block
// per test, the sign-off at the foot. `plan` is resultId -> page number, as
// chosen on screen; without it the pages fill up on their own.
export const reportBundle = (sheets, lab = {}, plan = {}) => {
  const cells = identityCells(sheets[0] || {});
  return layout(sheets, plan).groups
    .map((group) => page(lab, cells, group.map((b) => testBlock(b.sheet, b.lines, b.continued))));
};
