import type {
  Catalog,
  Master,
  ParameterOption,
  ReferenceInterval,
  Test,
  TestParameter,
} from '@workspace/api-client-react';

export interface Idx {
  raw: Catalog;
  testById: Map<number, Test>;
  paramById: Map<number, TestParameter>;
  paramsByTest: Map<number, TestParameter[]>;
  optsByParam: Map<number, ParameterOption[]>;
  refsByParam: Map<number, ReferenceInterval[]>;
  cat: Map<number, Master>;
  spec: Map<number, Master>;
  meth: Map<number, Master>;
}

function group<T>(items: T[], key: (t: T) => number, sort: (a: T, b: T) => number) {
  const m = new Map<number, T[]>();
  for (const i of items) {
    const k = key(i);
    const l = m.get(k);
    if (l) l.push(i);
    else m.set(k, [i]);
  }
  m.forEach((l) => l.sort(sort));
  return m;
}

export function indexCatalog(c: Catalog): Idx {
  const mm = (l: Master[]) => new Map(l.map((x) => [x.id, x]));
  return {
    raw: c,
    testById: new Map(c.tests.map((t) => [t.id as number, t])),
    paramById: new Map(c.parameters.map((p) => [p.id as number, p])),
    paramsByTest: group(c.parameters, (p) => p.testId, (a, b) => a.displayOrder - b.displayOrder || (a.id ?? 0) - (b.id ?? 0)),
    optsByParam: group(c.options, (o) => o.parameterId, (a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0)),
    refsByParam: group(c.references, (r) => r.parameterId, (a, b) => (a.version ?? 1) - (b.version ?? 1) || (a.id ?? 0) - (b.id ?? 0)),
    cat: mm(c.categories),
    spec: mm(c.specimens),
    meth: mm(c.methods),
  };
}

export const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s));
export const str = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');
export const isApproved = (r: ReferenceInterval) => !!r.approvedBy;
export const msg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

export function fmtRange(r: ReferenceInterval): string {
  if (r.referenceText) return r.referenceText;
  if (r.decisionType === 'Above') return `Above ${r.lowerValue ?? ''}`;
  if (r.decisionType === 'Below') return `Below ${r.upperValue ?? ''}`;
  if (r.decisionType === 'Equals') return `Equals ${r.lowerValue ?? ''}`;
  const p: string[] = [];
  if (r.lowerValue !== null && r.lowerValue !== undefined) p.push(`${r.lowerOperator ?? '>='} ${r.lowerValue}`);
  if (r.upperValue !== null && r.upperValue !== undefined) p.push(`${r.upperOperator ?? '<='} ${r.upperValue}`);
  if (p.length) return `x ${p.join(' and x ')}`;
  return r.decisionType || 'No interval values';
}

export function fmtAge(r: ReferenceInterval) {
  const a = r.ageFrom ?? null;
  const b = r.ageTo ?? null;
  if (a === null && b === null) return 'Any age';
  return `${a ?? '0'} – ${b ?? 'no limit'} y`;
}

export function readiness(t: Test, ix: Idx) {
  const ps = (ix.paramsByTest.get(t.id as number) ?? []).filter((p) => p.active);
  const dropNoOpts = ps.filter((p) => p.dataType === 'Dropdown' && !(ix.optsByParam.get(p.id as number) ?? []).some((o) => o.active)).length;
  const needRef = ps.filter((p) => p.referenceType !== 'None');
  const withRef = needRef.filter((p) => (ix.refsByParam.get(p.id as number) ?? []).some((r) => r.active && isApproved(r))).length;
  const unapproved = ps.reduce((n, p) => n + (ix.refsByParam.get(p.id as number) ?? []).filter((r) => !isApproved(r)).length, 0);
  return { params: ps.length, dropNoOpts, needRef: needRef.length, withRef, unapproved };
}

export interface Ctx {
  age: number | null;
  sex: string;
  context: string;
  collectedAt: string;
}

export function applicable(p: TestParameter, refs: ReferenceInterval[], x: Ctx): ReferenceInterval[] {
  const day = x.collectedAt.slice(0, 10);
  return refs.filter((r) => {
    if (!r.active || !isApproved(r)) return false;
    if (r.context.trim().toLowerCase() !== x.context.trim().toLowerCase()) return false;
    if (r.sex !== 'Any' && r.sex !== x.sex) return false;
    if (x.age === null || Number.isNaN(x.age)) return false;
    if (r.ageFrom !== null && r.ageFrom !== undefined && x.age < r.ageFrom) return false;
    if (r.ageTo !== null && r.ageTo !== undefined && x.age > r.ageTo) return false;
    if (day) {
      if (r.effectiveFrom && day < r.effectiveFrom.slice(0, 10)) return false;
      if (r.effectiveTo && day > r.effectiveTo.slice(0, 10)) return false;
    }
    if (r.unit && p.unit && r.unit.trim() !== p.unit.trim()) return false;
    return true;
  });
}

export interface Evaluation {
  state: 'none' | 'multiple' | 'single';
  text: string;
  flag: string;
  referenceId: number | null;
}

export function evaluate(p: TestParameter, value: string, matches: ReferenceInterval[], opts: ParameterOption[]): Evaluation {
  let flag = '';
  if (p.dataType === 'Dropdown' && value) {
    const o = opts.find((x) => x.code === value);
    if (o?.abnormal) flag = 'Abnormal';
  }
  if (matches.length === 0) return { state: 'none', text: 'Not configured', flag, referenceId: null };
  if (matches.length > 1) return { state: 'multiple', text: 'Multiple matches', flag, referenceId: null };
  const r = matches[0];
  const has = (n: number | null | undefined): n is number => n !== null && n !== undefined;
  const dt = r.decisionType;
  const rawVal = value.trim();
  const qual = p.dataType === 'Dropdown' ? opts.find((x) => x.code === rawVal)?.label ?? rawVal : rawVal;
  if (p.dataType === 'Numeric' && (dt === 'Above' || dt === 'Below' || dt === 'Equals') && rawVal !== '' && !Number.isNaN(Number(rawVal))) {
    const v = Number(rawVal);
    flag = '';
    if (dt === 'Above' && has(r.lowerValue) && v > r.lowerValue) flag = 'High';
    else if (dt === 'Below' && has(r.upperValue) && v < r.upperValue) flag = 'Low';
    else if (dt === 'Equals' && has(r.lowerValue) && v !== r.lowerValue) flag = 'Abnormal';
  } else if (p.referenceType === 'Text' && r.referenceText && rawVal !== '') {
    if (qual.toLowerCase() !== r.referenceText.trim().toLowerCase()) flag = 'Abnormal';
  } else if (p.dataType === 'Numeric' && rawVal !== '' && !Number.isNaN(Number(rawVal))) {
    const v = Number(rawVal);
    if (has(r.criticalLow) && v < r.criticalLow) flag = 'Critical Low';
    else if (has(r.criticalHigh) && v > r.criticalHigh) flag = 'Critical High';
    else if (has(r.lowerValue) && (r.lowerOperator === '>' ? v <= r.lowerValue : v < r.lowerValue)) flag = 'Low';
    else if (has(r.upperValue) && (r.upperOperator === '<' ? v >= r.upperValue : v > r.upperValue)) flag = 'High';
    else if (has(r.lowerValue) || has(r.upperValue)) flag = 'Within interval';
  }
  if (p.dataType === 'Numeric' && rawVal !== '' && !Number.isNaN(Number(rawVal))) {
    const valueNumber = Number(rawVal);
    if (has(r.criticalLow) && valueNumber < r.criticalLow) flag = 'Critical Low';
    else if (has(r.criticalHigh) && valueNumber > r.criticalHigh) flag = 'Critical High';
  }
  return { state: 'single', text: fmtRange(r), flag, referenceId: r.id ?? null };
}

const FLAGS: Record<string, string> = { H: 'High', L: 'Low', A: 'Abnormal', CL: 'Critical Low', CH: 'Critical High', N: 'Normal' };
export const flagLabel = (f: string) => FLAGS[f] ?? f;
export const flagTone = (f0: string) => {
  const f = flagLabel(f0);
  return flagToneInner(f);
};
const flagToneInner = (f: string) =>
  /critical/i.test(f) ? 'pill-bad' : /^(low|high|abnormal)$/i.test(f) ? 'pill-warn' : f ? 'pill-ok' : '';

export interface VState {
  value: string;
  disposition: 'Completed' | 'Not Done';
  skipReason: string;
  skipApprovedBy: string;
  comment: string;
}

export const blankV = (): VState => ({ value: '', disposition: 'Completed', skipReason: '', skipApprovedBy: '', comment: '' });

export function validateValue(p: TestParameter, v: VState, opts: ParameterOption[]): string | null {
  if (v.disposition === 'Not Done') {
    if (!v.skipReason.trim()) return 'Skip reason required';
    if (!v.skipApprovedBy.trim()) return 'Skip approver required';
    if (!v.comment.trim()) return 'Comment required for Not Done';
    return null;
  }
  const val = v.value.trim();
  if (!val) return p.required ? 'Required' : null;
  if (p.dataType === 'Numeric') {
    const n = Number(val);
    if (Number.isNaN(n)) return 'Must be a number';
    if (n < 0 && !p.allowNegative) return 'Negative values not allowed';
    if (p.technicalMin !== null && p.technicalMin !== undefined && n < p.technicalMin) return `Below technical minimum ${p.technicalMin}`;
    if (p.technicalMax !== null && p.technicalMax !== undefined && n > p.technicalMax) return `Above technical maximum ${p.technicalMax}`;
    if (p.decimalPlaces !== null && p.decimalPlaces !== undefined) {
      const d = val.includes('.') ? val.split('.')[1].length : 0;
      if (d > p.decimalPlaces) return `Max ${p.decimalPlaces} decimal places`;
    }
  }
  if (p.dataType === 'Dropdown' && !opts.some((o) => o.active && o.code === val)) return 'Choose a configured option';
  if (p.dataType === 'Boolean' && val !== 'Yes' && val !== 'No') return 'Choose Yes or No';
  return null;
}

export const nextStatus: Record<string, 'Entered' | 'Verified' | 'Released' | undefined> = {
  Draft: 'Entered',
  Entered: 'Verified',
  Verified: 'Released',
};

export const statusTone = (s: string) =>
  s === 'Released' ? 'pill-ok' : s === 'Verified' ? 'pill-ink' : s === 'Entered' ? 'pill-warn' : '';
