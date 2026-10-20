import { html, icon } from './dom.js';
import { fmtDate } from './lab.js';

// The printed sheet, shared by the Reports page and a patient's bundled PDF so the
// letterhead, column order and paper styling exist in exactly one place.
export const reportSheet = (r, lab = {}) => html`<article class="report-sheet pop" data-testid="report-sheet">
  <header class="rs-letterhead">
    <img class="rs-logo" src="${lab.logo || 'img/gs-lab-mark.svg'}" alt="">
    <div>
      <div class="rs-lab-name" data-testid="text-report-lab-name">${lab.name || 'Laboratory'}</div>
      ${lab.tagline ? html`<div class="rs-lab-tag">${lab.tagline}</div>` : ''}
    </div>
    ${(lab.address || lab.phone1 || lab.phone2) ? html`<div class="rs-contact" data-testid="text-report-contact">
      ${lab.address ? html`<div>${lab.address}</div>` : ''}
      ${lab.phone1 ? html`<div class="rs-phone">${icon.phone(11)}<span>${lab.phone1}</span></div>` : ''}
      ${lab.phone2 ? html`<div class="rs-phone">${icon.phone(11)}<span>${lab.phone2}</span></div>` : ''}
    </div>` : ''}
  </header>
  <div class="rs-rule"></div>
  <div class="rs-patient">
    <div><div class="lbl">Patient's name</div><div class="rs-v" data-testid="text-report-patient">${r.patientName}</div></div>
    <div><div class="lbl">Age / sex</div><div class="rs-v">${r.age} y \u00b7 ${r.sex}</div></div>
    <div><div class="lbl">Referred by</div><div class="rs-v">${r.doctorName || '\u2014'}</div></div>
    <div><div class="lbl">Collected</div><div class="rs-v">${fmtDate(r.collectedAt)}</div></div>
    <div><div class="lbl">Reported</div><div class="rs-v">${r.completedAt ? fmtDate(r.completedAt) : '\u2014'}</div></div>
    <div><div class="lbl">Result no.</div><div class="rs-v mono">#${r.resultId}</div></div>
  </div>
  <div class="rs-top"><h2>${r.reportTitle || r.testName}</h2><div class="mono right">${r.testCode}<br>Result #${r.resultId}</div></div>
  <table class="rs-tbl"><thead><tr>${['Parameter', 'Result', 'Reference / normal ranges', 'Unit'].map((h) => html`<th>${h}</th>`)}</tr></thead>
    <tbody>${(r.lines || []).map((l, i) => html`<tr data-testid="report-line-${i}">
      <td><b>${l.name}</b></td><td class="mono">${l.optionLabel || l.value}</td>
      <td class="mono" data-testid="report-line-ranges-${i}">${(l.normalRanges ?? []).length
        ? html`${l.normalRanges.map((line, n) => html`<div data-testid="report-line-ranges-${i}-${n}">${line}</div>`)}`
        : html`<div class="muted">Not configured</div>`}</td>
      <td class="mono">${l.unit}</td></tr>`)}</tbody></table>
</article>`;
