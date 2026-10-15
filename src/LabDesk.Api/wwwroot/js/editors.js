import { html } from './dom.js';
import { openModal } from './modal.js';
import { field, input, textarea, select, check, bindForm } from './forms.js';
import { api } from './api.js';
import { mutate } from './store.js';
import { str, toNum } from './lab.js';

export function openTestEditor({ test, ix, onSaved }) {
  const maxOrder = Math.max(0, ...ix.raw.tests.map((t) => t.displayOrder));
  const f = {
    code: test?.code ?? '', name: test?.name ?? '', shortName: test?.shortName ?? '',
    categoryId: str(test?.categoryId), specimenTypeId: str(test?.specimenTypeId), methodId: str(test?.methodId),
    description: test?.description ?? '', patientPreparation: test?.patientPreparation ?? '',
    collectionInstructions: test?.collectionInstructions ?? '', container: test?.container ?? '',
    minimumSample: test?.minimumSample ?? '', turnaroundTime: test?.turnaroundTime ?? '',
    price: str(test?.price ?? 0), displayOrder: str(test?.displayOrder ?? maxOrder + 10),
    active: test?.active ?? true, reportTitle: test?.reportTitle ?? '', notes: test?.notes ?? '',
  };
  const validate = (v) => {
    const e = {};
    const price = toNum(v.price), order = toNum(v.displayOrder);
    if (!v.code.trim()) e.code = 'Required';
    if (!v.name.trim()) e.name = 'Required';
    if (!v.categoryId) e.categoryId = 'Required';
    if (!v.specimenTypeId) e.specimenTypeId = 'Required';
    if (price === null || Number.isNaN(price) || price < 0) e.price = 'Must be 0 or more';
    if (order === null || Number.isNaN(order)) e.displayOrder = 'Required number';
    return e;
  };
  const opts = (l, cur) => l.filter((m) => m.active || m.id === cur).map((m) => ({ value: m.id, label: m.name }));
  const inp = (k, label, type = 'text') => field(k, label, input(k, f[k], { type, testid: `input-test-${k}` }));
  const body = html`<div class="grid2">
    ${inp('code', 'Code')}${inp('name', 'Name')}${inp('shortName', 'Short name')}${inp('reportTitle', 'Report title')}
    ${field('categoryId', 'Category', select('categoryId', f.categoryId, [{ value: '', label: 'Select\u2026' }, ...opts(ix.raw.categories, test?.categoryId)], { testid: 'select-test-category' }))}
    ${field('specimenTypeId', 'Specimen type', select('specimenTypeId', f.specimenTypeId, [{ value: '', label: 'Select\u2026' }, ...opts(ix.raw.specimens, test?.specimenTypeId)], { testid: 'select-test-specimen' }))}
    ${field('methodId', 'Method (optional)', select('methodId', f.methodId, [{ value: '', label: 'None' }, ...opts(ix.raw.methods, test?.methodId)], { testid: 'select-test-method' }))}
    ${inp('container', 'Container')}${inp('minimumSample', 'Minimum sample')}${inp('turnaroundTime', 'Turnaround time')}
    ${inp('price', 'Price', 'number')}${inp('displayOrder', 'Display order', 'number')}
    ${field('description', 'Description', textarea('description', f.description, 'input-test-description'), { span: 2 })}
    ${field('patientPreparation', 'Patient preparation', textarea('patientPreparation', f.patientPreparation, 'input-test-prep'), { span: 2 })}
    ${field('collectionInstructions', 'Collection instructions', textarea('collectionInstructions', f.collectionInstructions, 'input-test-collection'), { span: 2 })}
    ${field('notes', 'Notes (shown on result entry and report)', textarea('notes', f.notes, 'input-test-notes'), { span: 2 })}
    ${check('active', f.active, 'Active', 'check-test-active')}
  </div>`;
  openModal({
    wide: true, title: test ? `Edit test ${test.code}` : 'New test',
    subtitle: 'Definition only. Parameters, options and references are configured on the test page.',
    saveLabel: test ? 'Save test' : 'Create test', body,
    onMount: (ctx) => bindForm(ctx.root, f, validate),
    onSave: async (ctx) => {
      if (Object.keys(validate(f)).length) return ctx.setErr('Fix the highlighted fields.');
      const saved = await mutate(() => api.saveTest({
        id: test?.id, code: f.code.trim(), name: f.name.trim(), shortName: f.shortName, categoryId: Number(f.categoryId),
        specimenTypeId: Number(f.specimenTypeId), methodId: f.methodId ? Number(f.methodId) : null,
        description: f.description, patientPreparation: f.patientPreparation, collectionInstructions: f.collectionInstructions,
        container: f.container, minimumSample: f.minimumSample, turnaroundTime: f.turnaroundTime, price: toNum(f.price),
        displayOrder: toNum(f.displayOrder), active: f.active, reportTitle: f.reportTitle, notes: f.notes,
      }));
      ctx.close();
      if (onSaved) onSaved(saved);
    },
  });
}

export function openParameterEditor({ testId, param, nextOrder, onSaved }) {
  const f = {
    code: param?.code ?? '', name: param?.name ?? '', dataType: param?.dataType ?? 'Numeric', unit: param?.unit ?? '',
    resultFormat: param?.resultFormat ?? '', decimalPlaces: str(param?.decimalPlaces), required: param?.required ?? false,
    allowNegative: param?.allowNegative ?? false, technicalMin: str(param?.technicalMin), technicalMax: str(param?.technicalMax),
    referenceType: param?.referenceType ?? 'Range', displayReferenceText: param?.displayReferenceText ?? '',
    displayOrder: str(param?.displayOrder ?? nextOrder), active: param?.active ?? true, notes: param?.notes ?? '',
  };
  const validate = (v) => {
    const e = {};
    const num = v.dataType === 'Numeric';
    const dp = toNum(v.decimalPlaces), tmin = toNum(v.technicalMin), tmax = toNum(v.technicalMax), ord = toNum(v.displayOrder);
    if (!v.code.trim()) e.code = 'Required';
    if (!v.name.trim()) e.name = 'Required';
    if (num && dp !== null && (!Number.isInteger(dp) || dp < 0 || dp > 8)) e.decimalPlaces = 'Integer 0\u20138';
    if (num && tmin !== null && Number.isNaN(tmin)) e.technicalMin = 'Not a number';
    if (num && tmax !== null && Number.isNaN(tmax)) e.technicalMax = 'Not a number';
    if (num && tmin !== null && tmax !== null && tmin > tmax) e.technicalMax = 'Must be \u2265 minimum';
    if (ord === null || Number.isNaN(ord)) e.displayOrder = 'Required number';
    return e;
  };
  const inp = (k, label, type = 'text', hint, numOnly) =>
    field(k, label, input(k, f[k], { type, testid: `input-param-${k}` }), { hint, extra: numOnly ? html`data-num="1"` : '' });
  const body = html`<div class="grid2">
    ${inp('code', 'Code')}${inp('name', 'Name')}
    ${field('dataType', 'Data type', select('dataType', f.dataType, ['Numeric', 'Text', 'Dropdown', 'Boolean', 'Date'], { testid: 'select-param-dataType' }))}
    ${field('referenceType', 'Reference type', select('referenceType', f.referenceType, ['Range', 'Text', 'Decision Value', 'None'], { testid: 'select-param-referenceType' }))}
    ${inp('unit', 'Unit')}${inp('resultFormat', 'Result format')}
    ${inp('decimalPlaces', 'Decimal places', 'number', '0 to 8, blank for unrestricted', true)}
    ${inp('technicalMin', 'Technical minimum', 'number', 'Hard validation limit, not a reference interval', true)}
    ${inp('technicalMax', 'Technical maximum', 'number', '', true)}
    ${inp('displayReferenceText', 'Display reference text')}${inp('displayOrder', 'Display order', 'number')}
    ${field('notes', 'Notes (shown at result entry)', textarea('notes', f.notes, 'input-param-notes'), { span: 2 })}
    <div class="checks">
      ${check('required', f.required, 'Required', 'check-param-required')}
      <span data-num="1">${check('allowNegative', f.allowNegative, 'Allow negative', 'check-param-negative')}</span>
      ${check('active', f.active, 'Active', 'check-param-active')}
    </div>
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
        id: param?.id, testId, code: f.code.trim(), name: f.name.trim(), dataType: f.dataType, unit: f.unit,
        resultFormat: f.resultFormat, decimalPlaces: num ? toNum(f.decimalPlaces) : null, required: f.required,
        allowNegative: num ? f.allowNegative : false, technicalMin: num ? toNum(f.technicalMin) : null, technicalMax: num ? toNum(f.technicalMax) : null,
        referenceType: f.referenceType, displayReferenceText: f.displayReferenceText, displayOrder: toNum(f.displayOrder),
        active: f.active, notes: f.notes,
      }));
      ctx.close();
      if (onSaved) onSaved(saved);
    },
  });
}

export function openOptionEditor({ parameterId, option, nextOrder }) {
  const f = { code: option?.code ?? '', label: option?.label ?? '', sortOrder: str(option?.sortOrder ?? nextOrder), abnormal: option?.abnormal ?? false, active: option?.active ?? true };
  const body = html`<div class="grid2">
    ${field('code', 'Code', input('code', f.code, { testid: 'input-option-code' }))}
    ${field('label', 'Label', input('label', f.label, { testid: 'input-option-label' }))}
    ${field('sortOrder', 'Sort order', input('sortOrder', f.sortOrder, { type: 'number', testid: 'input-option-sort' }))}
    <div class="checks end">${check('abnormal', f.abnormal, 'Abnormal', 'check-option-abnormal')}${check('active', f.active, 'Active', 'check-option-active')}</div>
  </div>`;
  openModal({
    title: option ? 'Edit option' : 'New option', subtitle: 'Abnormal drives the result flag. Nothing is assumed.', body,
    onMount: (ctx) => bindForm(ctx.root, f, () => ({})),
    onSave: async (ctx) => {
      const ord = toNum(f.sortOrder);
      if (!f.code.trim() || !f.label.trim() || ord === null || Number.isNaN(ord)) return ctx.setErr('Code, label and a numeric sort order are required.');
      await mutate(() => api.saveOption({ id: option?.id, parameterId, code: f.code.trim(), label: f.label.trim(), sortOrder: ord, abnormal: f.abnormal, active: f.active }));
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
