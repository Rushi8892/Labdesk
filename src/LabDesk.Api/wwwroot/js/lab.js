// Port of artifacts/labdesk/src/lib/lab.ts. Keep logic identical to the server.
// Reference lines are free text: no line is compared against a value, so nothing
// here computes a flag.

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
    tests: c.tests || [], parameters: c.parameters || [], options: c.options || [],
    categories: c.categories || [], specimens: c.specimens || [], methods: c.methods || [],
  };
  return {
    raw,
    testById: new Map(raw.tests.map((t) => [t.id, t])),
    paramById: new Map(raw.parameters.map((p) => [p.id, p])),
    paramsByTest: group(raw.parameters, (p) => p.testId, (a, b) => a.displayOrder - b.displayOrder || (a.id ?? 0) - (b.id ?? 0)),
    optsByParam: group(raw.options, (o) => o.parameterId, (a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0)),
    cat: mm(raw.categories),
    spec: mm(raw.specimens),
    meth: mm(raw.methods),
  };
}

export const toNum = (s) => (String(s ?? '').trim() === '' ? null : Number(s));
export const str = (n) => (n === null || n === undefined ? '' : String(n));
export const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '\u2014');
export const msg = (e) => (e instanceof Error ? e.message : 'Request failed');
const has = (n) => n !== null && n !== undefined;

// The reference lines a parameter's row prints, one entry per line, in the order
// they were entered. Mirrors the normal_ranges array the server stores.
export function rangeLines(p) {
  return (p?.normalRanges ?? []).map((line) => String(line ?? '').trim()).filter(Boolean);
}

// The same lines on a single line of text, for cells that cannot stack them.
export function rangeText(p) {
  const lines = rangeLines(p);
  return lines.length ? lines.join(' \u00b7 ') : 'Not configured';
}

// A parameter is ready when it can be used: a dropdown needs its options, and
// anything that prints a reference needs at least one line. Only used to flag
// work still to do.
export function readiness(t, ix) {
  const ps = (ix.paramsByTest.get(t.id) ?? []).filter((p) => p.active);
  const ready = ps.filter((p) => (p.dataType === 'Dropdown'
    ? (ix.optsByParam.get(p.id) ?? []).some((o) => o.active)
    : rangeLines(p).length > 0));
  return { params: ps.length, ready: ready.length, missing: ps.length - ready.length };
}

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
