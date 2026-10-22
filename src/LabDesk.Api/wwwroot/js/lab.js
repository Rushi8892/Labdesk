// Port of artifacts/labdesk/src/lib/lab.ts. Keep logic identical to the server.
// Reference lines are free text, so isAbnormal() reads what it can from them and
// stays quiet about anything it cannot parse - it never guesses a flag.

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

// Amber marks work that is not finished, so a draft is obvious in the worklist.
export const statusTone = (s) => (s === 'Completed' ? 'pill-ok' : 'pill-warn');

// A dropdown stores the option code; the report and the reference speak labels.
export const optionLabel = (value, opts) => (opts ?? []).find((o) => o.code === value)?.label ?? value;

// A line is "normal" when its own text says so; the other bands of a staged
// reference (Borderline-High, Deficiency, Equivocal) are not.
const NORMAL_BAND = /\b(normal|desirable|optimum|optimal|negative|non-?reactive|non-?diabetes|no growth|not significant)\b/i;
// "Male", "Female", "Pregnancy - First Trimester" qualify who the line is for,
// they say nothing about the result being good or bad.
const DEMOGRAPHIC = /\b(male|female|adult|child|children|infant|newborn|pregnan\w*|trimester|yrs|years)\b/i;

const refParts = (line) => {
  const [range = '', ...rest] = String(line).split(':');
  return { range: range.trim(), label: rest.join(':').trim() };
};

// "12.0 - 15.0", "< 200", "> 190 : Very High", "0.6 - 1.8 : Male", "≥ 6.5 : Diabetes".
const refInterval = (range) => {
  const body = range.replace(/\u2265/g, '>').replace(/\u2264/g, '<');
  const nums = (body.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (body.startsWith('<')) return { low: -Infinity, high: nums[0] };
  if (body.startsWith('>')) return { low: nums[0], high: Infinity };
  return nums.length >= 2 ? { low: nums[0], high: nums[1] } : null;
};

// True when a value falls outside the reference the lab typed for it. Text
// references ("Negative", "No growth") flag anything that is not that word.
export function isAbnormal(value, lines, sex) {
  const raw = String(value ?? '').trim();
  const refs = (lines ?? []).map(refParts).filter((r) => r.range);
  if (!raw || !refs.length) return false;

  const n = Number(raw);
  if (Number.isNaN(n)) {
    const words = refs.filter((r) => !/\d/.test(r.range));
    return words.length > 0 && !words.some((r) => r.range.toLowerCase() === raw.toLowerCase());
  }

  const s = /^f/i.test(String(sex ?? '')) ? 'female' : sex ? 'male' : '';
  const own = refs.filter(({ label }) => {
    const l = label.toLowerCase();
    if (s === 'male') return !/^female|\bpregnancy/.test(l);
    if (s === 'female') return !/^male\b/.test(l);
    return true;
  });
  const spans = own
    .map(({ range, label }) => {
      const span = refInterval(range);
      return span ? { ...span, label } : null;
    })
    .filter(Boolean);
  if (!spans.length) return false;
  const hit = (list) => list.some((span) => n >= span.low && n <= span.high);
  const normal = spans.filter((span) => NORMAL_BAND.test(span.label));
  if (normal.length) return !hit(normal);
  // A reference made only of severity bands (Positive, High, Deficient) has no
  // normal stretch at all, so any number is worth a red mark.
  if (spans.some((span) => span.label && !DEMOGRAPHIC.test(span.label))) return true;
  return !hit(spans);
}
