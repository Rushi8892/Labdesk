// Port of artifacts/labdesk/src/lib/lab.ts. Keep logic identical to the server.

function group(items, key, sort) {
  const m = new Map();
  for (const i of items) {
    const k = key(i);
    const l = m.get(k);
    if (l) l.push(i); else m.set(k, [i]);
  }
  m.forEach((l) => l.sort(sort));
  return m;
}

export function indexCatalog(c) {
  const mm = (l) => new Map((l || []).map((x) => [x.id, x]));
  const raw = {
    tests: c.tests || [], parameters: c.parameters || [], options: c.options || [], references: c.references || [],
    categories: c.categories || [], specimens: c.specimens || [], methods: c.methods || [],
  };
  return {
    raw,
    testById: new Map(raw.tests.map((t) => [t.id, t])),
    paramById: new Map(raw.parameters.map((p) => [p.id, p])),
    paramsByTest: group(raw.parameters, (p) => p.testId, (a, b) => a.displayOrder - b.displayOrder || (a.id ?? 0) - (b.id ?? 0)),
    optsByParam: group(raw.options, (o) => o.parameterId, (a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0)),
    refsByParam: group(raw.references, (r) => r.parameterId, (a, b) => (a.version ?? 1) - (b.version ?? 1) || (a.id ?? 0) - (b.id ?? 0)),
    cat: mm(raw.categories),
    spec: mm(raw.specimens),
    meth: mm(raw.methods),
  };
}

export const toNum = (s) => (String(s ?? '').trim() === '' ? null : Number(s));
export const str = (n) => (n === null || n === undefined ? '' : String(n));
export const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '\u2014');
export const isApproved = (r) => !!r.approvedBy;
export const msg = (e) => (e instanceof Error ? e.message : 'Request failed');
const has = (n) => n !== null && n !== undefined;

export function fmtRange(r) {
  if (r.referenceText) return r.referenceText;
  if (r.decisionType === 'Above') return `Above ${r.lowerValue ?? ''}`;
  if (r.decisionType === 'Below') return `Below ${r.upperValue ?? ''}`;
  if (r.decisionType === 'Equals') return `Equals ${r.lowerValue ?? ''}`;
  const p = [];
  if (has(r.lowerValue)) p.push(`${r.lowerOperator ?? '>='} ${r.lowerValue}`);
  if (has(r.upperValue)) p.push(`${r.upperOperator ?? '<='} ${r.upperValue}`);
  if (p.length) return `x ${p.join(' and x ')}`;
  return r.decisionType || 'No interval values';
}

export function fmtAge(r) {
  const a = r.ageFrom ?? null;
  const b = r.ageTo ?? null;
  if (a === null && b === null) return 'Any age';
  return `${a ?? '0'} \u2013 ${b ?? 'no limit'} y`;
}

export function readiness(t, ix) {
  const ps = (ix.paramsByTest.get(t.id) ?? []).filter((p) => p.active);
  const dropNoOpts = ps.filter((p) => p.dataType === 'Dropdown' && !(ix.optsByParam.get(p.id) ?? []).some((o) => o.active)).length;
  const needRef = ps.filter((p) => p.referenceType !== 'None');
  const withRef = needRef.filter((p) => (ix.refsByParam.get(p.id) ?? []).some((r) => r.active && isApproved(r))).length;
  const unapproved = ps.reduce((n, p) => n + (ix.refsByParam.get(p.id) ?? []).filter((r) => !isApproved(r)).length, 0);
  return { params: ps.length, dropNoOpts, needRef: needRef.length, withRef, unapproved };
}

export function applicable(p, refs, x) {
  const day = (x.collectedAt || '').slice(0, 10);
  const matching = refs.filter((r) => {
    if (!r.active || !isApproved(r)) return false;
    if (r.sex !== 'Any' && r.sex !== x.sex) return false;
    if (x.age === null || Number.isNaN(x.age)) return false;
    if (has(r.ageFrom) && x.age < r.ageFrom) return false;
    if (has(r.ageTo) && x.age > r.ageTo) return false;
    if (day) {
      if (r.effectiveFrom && day < r.effectiveFrom.slice(0, 10)) return false;
      if (r.effectiveTo && day > r.effectiveTo.slice(0, 10)) return false;
    }
    if (r.unit && p.unit && r.unit.trim() !== p.unit.trim()) return false;
    return true;
  });
  const ranked = matching.map((r) => ({
    r,
    specificity: (r.sex === x.sex ? 1 : 0) + (has(r.ageFrom) || has(r.ageTo) ? 1 : 0),
    ageWidth: (r.ageTo ?? Number.MAX_SAFE_INTEGER / 2) - (r.ageFrom ?? -Number.MAX_SAFE_INTEGER / 2),
  })).sort((a, b) => b.specificity - a.specificity || a.ageWidth - b.ageWidth);
  if (!ranked.length) return [];
  const best = ranked[0];
  return ranked.filter((i) => i.specificity === best.specificity && i.ageWidth === best.ageWidth).map((i) => i.r);
}

export function evaluate(p, value, matches, opts) {
  let flag = '';
  if (p.dataType === 'Dropdown' && value) {
    const o = opts.find((x) => x.code === value);
    if (o?.abnormal) flag = 'Abnormal';
  }
  if (matches.length === 0) return { state: 'none', text: 'Not configured', flag, referenceId: null };
  if (matches.length > 1) return { state: 'multiple', text: 'Multiple matches', flag, referenceId: null };
  const r = matches[0];
  const dt = r.decisionType;
  const rawVal = value.trim();
  const qual = p.dataType === 'Dropdown' ? opts.find((x) => x.code === rawVal)?.label ?? rawVal : rawVal;
  const isNum = rawVal !== '' && !Number.isNaN(Number(rawVal));
  if (p.dataType === 'Numeric' && (dt === 'Above' || dt === 'Below' || dt === 'Equals') && isNum) {
    const v = Number(rawVal);
    flag = '';
    if (dt === 'Above' && has(r.lowerValue) && v > r.lowerValue) flag = 'High';
    else if (dt === 'Below' && has(r.upperValue) && v < r.upperValue) flag = 'Low';
    else if (dt === 'Equals' && has(r.lowerValue) && v !== r.lowerValue) flag = 'Abnormal';
  } else if (p.referenceType === 'Text' && r.referenceText && rawVal !== '') {
    if (qual.toLowerCase() !== r.referenceText.trim().toLowerCase()) flag = 'Abnormal';
  } else if (p.dataType === 'Numeric' && isNum) {
    const v = Number(rawVal);
    if (has(r.criticalLow) && v < r.criticalLow) flag = 'Critical Low';
    else if (has(r.criticalHigh) && v > r.criticalHigh) flag = 'Critical High';
    else if (has(r.lowerValue) && (r.lowerOperator === '>' ? v <= r.lowerValue : v < r.lowerValue)) flag = 'Low';
    else if (has(r.upperValue) && (r.upperOperator === '<' ? v >= r.upperValue : v > r.upperValue)) flag = 'High';
    else if (has(r.lowerValue) || has(r.upperValue)) flag = 'Within interval';
  }
  if (p.dataType === 'Numeric' && isNum) {
    const v = Number(rawVal);
    if (has(r.criticalLow) && v < r.criticalLow) flag = 'Critical Low';
    else if (has(r.criticalHigh) && v > r.criticalHigh) flag = 'Critical High';
  }
  return { state: 'single', text: fmtRange(r), flag, referenceId: r.id ?? null };
}

const FLAGS = { H: 'High', L: 'Low', A: 'Abnormal', CL: 'Critical Low', CH: 'Critical High', N: 'Normal' };
export const flagLabel = (f) => FLAGS[f] ?? f;
export const flagTone = (f0) => {
  const f = flagLabel(f0);
  return /critical/i.test(f) ? 'pill-bad' : /^(low|high|abnormal)$/i.test(f) ? 'pill-warn' : f ? 'pill-ok' : '';
};

export function validateValue(p, value, opts) {
  const val = value.trim();
  if (!val) return p.required ? 'Required' : null;
  if (p.dataType === 'Numeric') {
    const n = Number(val);
    if (Number.isNaN(n)) return 'Must be a number';
    if (n < 0 && !p.allowNegative) return 'Negative values not allowed';
    if (has(p.technicalMin) && n < p.technicalMin) return `Below technical minimum ${p.technicalMin}`;
    if (has(p.technicalMax) && n > p.technicalMax) return `Above technical maximum ${p.technicalMax}`;
    if (has(p.decimalPlaces)) {
      const d = val.includes('.') ? val.split('.')[1].length : 0;
      if (d > p.decimalPlaces) return `Max ${p.decimalPlaces} decimal places`;
    }
  }
  if (p.dataType === 'Dropdown' && !opts.some((o) => o.active && o.code === val)) return 'Choose a configured option';
  if (p.dataType === 'Boolean' && val !== 'Yes' && val !== 'No') return 'Choose Yes or No';
  return null;
}

export const statusTone = (s) => (s === 'Completed' ? 'pill-ok' : '');
