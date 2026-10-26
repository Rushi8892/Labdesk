import { html } from './dom.js';
import { openModal } from './modal.js';
import { field, input, textarea, select, check, bindForm } from './forms.js';
import { api } from './api.js';
import { mutate, state } from './store.js';
import { str, toNum, parameterCode } from './lab.js';

// The reference textarea holds one printed line per line; blanks are dropped
// rather than rejected, exactly as the server does.
const linesOf = (text) => String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

export function openTestEditor({ test, ix, onSaved }) {
  const maxOrder = Math.max(0, ...ix.raw.tests.map((t) => t.displayOrder));
  const f = {
    code: test?.code ?? '', name: test?.name ?? '', shortName: test?.shortName ?? '',
    categoryId: str(test?.categoryId), specimenTypeId: str(test?.specimenTypeId), methodId: str(test?.methodId),
    description: test?.description ?? '', patientPreparation: test?.patientPreparation ?? '',
    collectionInstructions: test?.collectionInstructions ?? '', container: test?.container ?? '',
    minimumSample: test?.minimumSample ?? '', turnaroundTime: test?.turnaroundTime ?? '',
    displayOrder: str(test?.displayOrder ?? maxOrder + 10),
    active: test?.active ?? true, reportTitle: test?.reportTitle ?? '', notes: test?.notes ?? '',
  };
  const validate = (v) => {
    const e = {};
    const order = toNum(v.displayOrder);
    const code = v.code.trim().toLowerCase();
    if (!v.code.trim()) e.code = 'Required';
    else if (ix.raw.tests.some((t) => t.id !== test?.id && t.code.trim().toLowerCase() === code)) e.code = 'Already used by another test';
    if (!v.name.trim()) e.name = 'Required';
    if (!v.categoryId) e.categoryId = 'Required';
    if (!v.specimenTypeId) e.specimenTypeId = 'Required';
    if (order === null || Number.isNaN(order)) e.displayOrder = 'Required number';
    return e;
  };
  const opts = (l, cur) => l.filter((m) => m.active || m.id === cur).map((m) => ({ value: m.id, label: m.name }));
  const inp = (k, label, type = 'text') => field(k, label, input(k, f[k], { type, testid: `input-test-${k}` }));
  // Only what a test cannot exist without stays on the face of the form; the rest
  // is printed as optional detail and would only slow down adding a test.
  const body = html`<div class="grid2">
    ${inp('code', 'Code')}${inp('name', 'Name')}
    ${field('categoryId', 'Category', select('categoryId', f.categoryId, [{ value: '', label: 'Select\u2026' }, ...opts(ix.raw.categories, test?.categoryId)], { testid: 'select-test-category' }))}
    ${field('specimenTypeId', 'Specimen type', select('specimenTypeId', f.specimenTypeId, [{ value: '', label: 'Select\u2026' }, ...opts(ix.raw.specimens, test?.specimenTypeId)], { testid: 'select-test-specimen' }))}
    ${inp('reportTitle', 'Report title')}
    <div class="checks end">${check('active', f.active, 'Active', 'check-test-active')}</div>
    <details class="more"><summary>More details (optional)</summary><div class="grid2">
      ${inp('shortName', 'Short name')}
      ${field('methodId', 'Method', select('methodId', f.methodId, [{ value: '', label: 'None' }, ...opts(ix.raw.methods, test?.methodId)], { testid: 'select-test-method' }))}
      ${inp('container', 'Container')}${inp('minimumSample', 'Minimum sample')}
      ${inp('turnaroundTime', 'Turnaround time')}${inp('displayOrder', 'Display order', 'number')}
      ${field('description', 'Description', textarea('description', f.description, 'input-test-description'), { span: 2 })}
      ${field('patientPreparation', 'Patient preparation', textarea('patientPreparation', f.patientPreparation, 'input-test-prep'), { span: 2 })}
      ${field('collectionInstructions', 'Collection instructions', textarea('collectionInstructions', f.collectionInstructions, 'input-test-collection'), { span: 2 })}
      ${field('notes', 'Notes (shown on result entry and report)', textarea('notes', f.notes, 'input-test-notes'), { span: 2 })}
    </div></details>
  </div>`;
  openModal({
    wide: true, title: test ? `Edit test ${test.code}` : 'New test',
    subtitle: 'Definition only. Parameters, options and normal ranges are configured on the test page.',
    saveLabel: test ? 'Save test' : 'Create test', body,
    onMount: (ctx) => bindForm(ctx.root, f, validate),
    onSave: async (ctx) => {
      if (Object.keys(validate(f)).length) return ctx.setErr('Fix the highlighted fields.');
      const saved = await mutate(() => api.saveTest({
        id: test?.id, code: f.code.trim(), name: f.name.trim(), shortName: f.shortName, categoryId: Number(f.categoryId),
        specimenTypeId: Number(f.specimenTypeId), methodId: f.methodId ? Number(f.methodId) : null,
        description: f.description, patientPreparation: f.patientPreparation, collectionInstructions: f.collectionInstructions,
        container: f.container, minimumSample: f.minimumSample, turnaroundTime: f.turnaroundTime,
        displayOrder: toNum(f.displayOrder), active: f.active, reportTitle: f.reportTitle, notes: f.notes,
      }));
      ctx.close();
      if (onSaved) onSaved(saved);
    },
  });
}

export function openParameterEditor({ testId, param, nextOrder, taken = [], onSaved }) {
  const f = {
    code: param?.code ?? '', name: param?.name ?? '', dataType: param?.dataType ?? 'Numeric', unit: param?.unit ?? '',
    resultFormat: param?.resultFormat ?? '', decimalPlaces: str(param?.decimalPlaces), required: param?.required ?? false,
    allowNegative: param?.allowNegative ?? false, technicalMin: str(param?.technicalMin), technicalMax: str(param?.technicalMax),
    normalRanges: (param?.normalRanges ?? []).join('\n'),
    displayOrder: str(param?.displayOrder ?? nextOrder), active: param?.active ?? true, notes: param?.notes ?? '',
    section: param?.section ?? '',
  };
  // A code is bookkeeping, so a blank one is made from the name instead of being
  // demanded. Only a code already used on this test is rejected.
  const codeOf = (v) => v.code.trim() || parameterCode(v.name, taken);
  const validate = (v) => {
    const e = {};
    const num = v.dataType === 'Numeric';
    const dp = toNum(v.decimalPlaces), tmin = toNum(v.technicalMin), tmax = toNum(v.technicalMax), ord = toNum(v.displayOrder);
    const ranges = linesOf(v.normalRanges);
    if (!v.name.trim()) e.name = 'Required';
    else if (taken.some((c) => String(c).toUpperCase() === codeOf(v).toUpperCase())) e.code = 'Already used on this test';
    if (num && dp !== null && (!Number.isInteger(dp) || dp < 0 || dp > 8)) e.decimalPlaces = 'Integer 0\u20138';
    if (num && tmin !== null && Number.isNaN(tmin)) e.technicalMin = 'Not a number';
    if (num && tmax !== null && Number.isNaN(tmax)) e.technicalMax = 'Not a number';
    if (num && tmin !== null && tmax !== null && tmin > tmax) e.technicalMax = 'Must be \u2265 minimum';
    if (ranges.length > 10) e.normalRanges = 'At most 10 lines';
    else if (ranges.some((line) => line.length > 200)) e.normalRanges = 'Each line must be 200 characters or less';
    if (ord === null || Number.isNaN(ord)) e.displayOrder = 'Required number';
    return e;
  };
  const inp = (k, label, type = 'text', hint, numOnly) =>
    field(k, label, input(k, f[k], { type, testid: `input-param-${k}` }), { hint, extra: numOnly ? html`data-num="1"` : '' });
  // The five things a parameter is: what it is called, what it holds, its unit and
  // the reference it is read against. Everything else is a limit nobody usually sets.
  const body = html`<div class="grid2">
    ${inp('name', 'Name')}
    ${field('dataType', 'Data type', select('dataType', f.dataType, ['Numeric', 'Text', 'Dropdown', 'Boolean', 'Date'], { testid: 'select-param-dataType' }))}
    ${inp('unit', 'Unit')}
    ${inp('section', 'Report section', 'text', 'Optional heading, e.g. Microscopic Examination')}
    <div class="checks end" style="margin-top:18px;grid-column:span 2">
      ${check('required', f.required, 'Required', 'check-param-required')}
      ${check('active', f.active, 'Active', 'check-param-active')}
    </div>
    ${field('normalRanges', 'Reference / normal ranges', textarea('normalRanges', f.normalRanges, 'input-param-ranges'),
      { span: 2, hint: 'One line per line the report prints, e.g. 12.0 - 15.0 \u00b7 < 200 \u00b7 > 190 : Very High. A result outside them prints in red.' })}
    <details class="more"><summary>More details (optional)</summary><div class="grid2">
      ${inp('code', 'Code', 'text', 'Blank: taken from the name')}
      ${inp('displayOrder', 'Display order', 'number')}
      ${inp('decimalPlaces', 'Decimal places', 'number', '0 to 8, blank for unrestricted', true)}
      ${inp('technicalMin', 'Technical minimum', 'number', 'Hard validation limit, not a normal range', true)}
      ${inp('technicalMax', 'Technical maximum', 'number', '', true)}
      <div class="checks" data-num="1">${check('allowNegative', f.allowNegative, 'Allow negative', 'check-param-negative')}</div>
      ${field('notes', 'Notes (shown at result entry)', textarea('notes', f.notes, 'input-param-notes'), { span: 2 })}
    </div></details>
  </div>`;
  openModal({
    wide: true, title: param ? `Edit parameter ${param.code}` : 'New parameter',
    saveLabel: param ? 'Save parameter' : 'Add parameter', body,
    onMount: (ctx) => bindForm(ctx.root, f, validate, (v) => {
      ctx.root.querySelectorAll('[data-num]').forEach((el) => { el.hidden = v.dataType !== 'Numeric'; });
    }),
    onSave: async (ctx) => {
      if (Object.keys(validate(f)).length) return ctx.setErr('Fix the highlighted fields.');
      const num = f.dataType === 'Numeric';
      const saved = await mutate(() => api.saveParameter({
        id: param?.id, testId, code: codeOf(f), name: f.name.trim(), dataType: f.dataType, unit: f.unit,
        resultFormat: f.resultFormat, decimalPlaces: num ? toNum(f.decimalPlaces) : null, required: f.required,
        allowNegative: num ? f.allowNegative : false, technicalMin: num ? toNum(f.technicalMin) : null, technicalMax: num ? toNum(f.technicalMax) : null,
        normalRanges: linesOf(f.normalRanges).length ? linesOf(f.normalRanges) : null, displayOrder: toNum(f.displayOrder),
        active: f.active, notes: f.notes, section: f.section.trim() || null,
      }));
      ctx.close();
      if (onSaved) onSaved(saved);
    },
  });
}

export function openOptionEditor({ parameterId, option, nextOrder }) {
  const f = { code: option?.code ?? '', label: option?.label ?? '', sortOrder: str(option?.sortOrder ?? nextOrder), active: option?.active ?? true };
  const body = html`<div class="grid2">
    ${field('code', 'Code', input('code', f.code, { testid: 'input-option-code' }))}
    ${field('label', 'Label', input('label', f.label, { testid: 'input-option-label' }))}
    ${field('sortOrder', 'Sort order', input('sortOrder', f.sortOrder, { type: 'number', testid: 'input-option-sort' }))}
    <div class="checks end">${check('active', f.active, 'Active', 'check-option-active')}</div>
  </div>`;
  openModal({
    title: option ? 'Edit option' : 'New option', subtitle: 'The label is what result entry offers.', body,
    onMount: (ctx) => bindForm(ctx.root, f, () => ({})),
    onSave: async (ctx) => {
      const ord = toNum(f.sortOrder);
      if (!f.code.trim() || !f.label.trim() || ord === null || Number.isNaN(ord)) return ctx.setErr('Code, label and a numeric sort order are required.');
      await mutate(() => api.saveOption({ id: option?.id, parameterId, code: f.code.trim(), label: f.label.trim(), sortOrder: ord, active: f.active }));
      ctx.close();
    },
  });
}

export function openPatientEditor({ patient }) {
  const f = {
    name: patient?.name ?? '', age: str(patient?.age ?? ''), sex: patient?.sex ?? 'Male',
    phone: patient?.phone ?? '', doctorId: str(patient?.doctorId),
  };
  const validate = (v) => {
    const e = {};
    const age = toNum(v.age);
    if (!v.name.trim()) e.name = 'Required';
    if (age === null || Number.isNaN(age) || age < 0 || age > 999.99) e.age = 'Between 0 and 999.99 years';
    return e;
  };
  // The doctor register is the only source of referring doctors; a patient links to
  // one by id, never by a typed name.
  const doctors = () => state.doctors.data ?? [];
  const body = html`<div class="grid2">
    ${field('name', 'Name', input('name', f.name, { testid: 'input-patient-name' }))}
    ${field('age', 'Age (years)', input('age', f.age, { type: 'number', testid: 'input-patient-age' }))}
    ${field('sex', 'Sex', select('sex', f.sex, ['Male', 'Female', 'Other'], { testid: 'select-patient-sex' }))}
    ${field('phone', 'Phone (optional)', input('phone', f.phone, { testid: 'input-patient-phone' }))}
    ${field('doctorId', 'Referring doctor (optional)',
      select('doctorId', f.doctorId, [{ value: '', label: 'None' }, ...doctors().map((d) => ({ value: str(d.id), label: d.name }))], { testid: 'select-patient-doctor' }),
      { span: 2, hint: doctors().length ? '' : 'No doctors on file yet.' })}
  </div>`;
  openModal({
    title: patient ? `Edit patient ${patient.name}` : 'New patient', body,
    saveLabel: patient ? 'Save patient' : 'Create patient',
    onMount: (ctx) => bindForm(ctx.root, f, validate),
    onSave: async (ctx) => {
      if (Object.keys(validate(f)).length) return ctx.setErr('Fix the highlighted fields.');
      await mutate(() => api.savePatient({
        id: patient?.id, name: f.name.trim(), age: toNum(f.age), sex: f.sex,
        phone: f.phone.trim(), doctorId: f.doctorId ? Number(f.doctorId) : null,
        // Not editable here any more, so an existing patient keeps the state it has.
        active: patient?.active ?? true,
      }));
      ctx.close();
    },
  });
}

export function openMasterEditor({ kind, master }) {
  const f = { code: master?.code ?? '', name: master?.name ?? '', active: master?.active ?? true };
  const body = html`<div class="grid2">
    ${field('code', 'Code', input('code', f.code, { testid: 'input-master-code' }))}
    ${field('name', 'Name', input('name', f.name, { testid: 'input-master-name' }))}
    ${check('active', f.active, 'Active', 'check-master-active')}
  </div>`;
  openModal({
    title: `${master ? 'Edit' : 'New'} ${kind.toLowerCase()}`, body,
    onMount: (ctx) => bindForm(ctx.root, f, () => ({})),
    onSave: async (ctx) => {
      if (!f.code.trim() || !f.name.trim()) return ctx.setErr('Code and name are required.');
      await mutate(() => api.saveMaster({ id: master?.id, kind, code: f.code.trim(), name: f.name.trim(), active: f.active }));
      ctx.close();
    },
  });
}
