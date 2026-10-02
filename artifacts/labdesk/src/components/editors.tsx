import { useState } from 'react';
import type { Master, ParameterOption, Test, TestParameter } from '@workspace/api-client-react';
import { Check, ConfirmFoot, Field, Modal } from '@/components/kit';
import { useLab } from '@/hooks/use-lab';
import type { Idx } from '@/lib/lab';
import { msg, str, toNum } from '@/lib/lab';

const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 } as const;

function useSubmit() {
  const [err, setErr] = useState<string | null>(null);
  return { err, setErr };
}

function Err({ e }: { e: string | null }) {
  return e ? <div className="mt-3 text-xs p-2 rounded" style={{ background: 'hsl(var(--bad-bg))', color: 'hsl(var(--bad))' }} data-testid="text-form-error">{e}</div> : null;
}

export function TestEditor({ test, ix, onClose, onSaved }: { test?: Test; ix: Idx; onClose: () => void; onSaved: (t: Test) => void }) {
  const lab = useLab();
  const { err, setErr } = useSubmit();
  const maxOrder = Math.max(0, ...ix.raw.tests.map((t) => t.displayOrder));
  const [f, setF] = useState({
    code: test?.code ?? '', name: test?.name ?? '', shortName: test?.shortName ?? '',
    categoryId: str(test?.categoryId), specimenTypeId: str(test?.specimenTypeId), methodId: str(test?.methodId),
    description: test?.description ?? '', patientPreparation: test?.patientPreparation ?? '',
    collectionInstructions: test?.collectionInstructions ?? '', container: test?.container ?? '',
    minimumSample: test?.minimumSample ?? '', turnaroundTime: test?.turnaroundTime ?? '',
    price: str(test?.price ?? 0), displayOrder: str(test?.displayOrder ?? maxOrder + 10),
    active: test?.active ?? true, reportTitle: test?.reportTitle ?? '', notes: test?.notes ?? '',
  });
  const s = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const price = toNum(f.price);
  const order = toNum(f.displayOrder);
  const errs: Record<string, string> = {};
  if (!f.code.trim()) errs.code = 'Required';
  if (!f.name.trim()) errs.name = 'Required';
  if (!f.categoryId) errs.categoryId = 'Required';
  if (!f.specimenTypeId) errs.specimenTypeId = 'Required';
  if (price === null || Number.isNaN(price) || price < 0) errs.price = 'Must be 0 or more';
  if (order === null || Number.isNaN(order)) errs.displayOrder = 'Required number';
  const cats = ix.raw.categories.filter((m) => m.active || m.id === test?.categoryId);
  const specs = ix.raw.specimens.filter((m) => m.active || m.id === test?.specimenTypeId);
  const meths = ix.raw.methods.filter((m) => m.active || m.id === test?.methodId);
  const opt = (l: Master[]) => l.map((m) => <option key={m.id} value={m.id}>{m.name}</option>);
  const submit = async () => {
    if (Object.keys(errs).length) return setErr('Fix the highlighted fields.');
    try {
      const saved = await lab.saveTest.mutateAsync({
        data: {
          id: test?.id, code: f.code.trim(), name: f.name.trim(), shortName: f.shortName, categoryId: Number(f.categoryId),
          specimenTypeId: Number(f.specimenTypeId), methodId: f.methodId ? Number(f.methodId) : null,
          description: f.description, patientPreparation: f.patientPreparation, collectionInstructions: f.collectionInstructions,
          container: f.container, minimumSample: f.minimumSample, turnaroundTime: f.turnaroundTime, price: price as number,
          displayOrder: order as number, active: f.active, reportTitle: f.reportTitle, notes: f.notes,
        },
      });
      onSaved(saved);
    } catch (e) { setErr(msg(e)); }
  };
  const inp = (k: keyof typeof f, label: string, extra?: { type?: string; span?: number; hint?: string }) => (
    <Field label={label} error={errs[k]} span={extra?.span} hint={extra?.hint}>
      <input className={`input ${errs[k] ? 'err' : ''}`} type={extra?.type ?? 'text'} value={f[k] as string} onChange={(e) => s(k, e.target.value)} data-testid={`input-test-${k}`} />
    </Field>
  );
  return (
    <Modal wide title={test ? `Edit test ${test.code}` : 'New test'} subtitle="Definition only. Parameters, options and references are configured on the test page." onClose={onClose}
      footer={<ConfirmFoot onClose={onClose} onSave={submit} busy={lab.saveTest.isPending} label={test ? 'Save test' : 'Create test'} />}>
      <div style={grid}>
        {inp('code', 'Code')}
        {inp('name', 'Name')}
        {inp('shortName', 'Short name')}
        {inp('reportTitle', 'Report title')}
        <Field label="Category" error={errs.categoryId}>
          <select className={`select ${errs.categoryId ? 'err' : ''}`} value={f.categoryId} onChange={(e) => s('categoryId', e.target.value)} data-testid="select-test-category"><option value="">Select…</option>{opt(cats)}</select>
        </Field>
        <Field label="Specimen type" error={errs.specimenTypeId}>
          <select className={`select ${errs.specimenTypeId ? 'err' : ''}`} value={f.specimenTypeId} onChange={(e) => s('specimenTypeId', e.target.value)} data-testid="select-test-specimen"><option value="">Select…</option>{opt(specs)}</select>
        </Field>
        <Field label="Method (optional)">
          <select className="select" value={f.methodId} onChange={(e) => s('methodId', e.target.value)} data-testid="select-test-method"><option value="">None</option>{opt(meths)}</select>
        </Field>
        {inp('container', 'Container')}
        {inp('minimumSample', 'Minimum sample')}
        {inp('turnaroundTime', 'Turnaround time')}
        {inp('price', 'Price', { type: 'number' })}
        {inp('displayOrder', 'Display order', { type: 'number' })}
        <Field label="Description" span={2}><textarea className="textarea" value={f.description} onChange={(e) => s('description', e.target.value)} data-testid="input-test-description" /></Field>
        <Field label="Patient preparation" span={2}><textarea className="textarea" value={f.patientPreparation} onChange={(e) => s('patientPreparation', e.target.value)} data-testid="input-test-prep" /></Field>
        <Field label="Collection instructions" span={2}><textarea className="textarea" value={f.collectionInstructions} onChange={(e) => s('collectionInstructions', e.target.value)} data-testid="input-test-collection" /></Field>
        <Field label="Notes (shown on result entry and report)" span={2}><textarea className="textarea" value={f.notes} onChange={(e) => s('notes', e.target.value)} data-testid="input-test-notes" /></Field>
        <Check checked={f.active} onChange={(v) => s('active', v)} label="Active" testId="check-test-active" />
      </div>
      <Err e={err} />
    </Modal>
  );
}

export function ParameterEditor({ testId, param, nextOrder, onClose, onSaved }: { testId: number; param?: TestParameter; nextOrder: number; onClose: () => void; onSaved: (p: TestParameter) => void }) {
  const lab = useLab();
  const { err, setErr } = useSubmit();
  const [f, setF] = useState({
    code: param?.code ?? '', name: param?.name ?? '', dataType: param?.dataType ?? 'Numeric', unit: param?.unit ?? '',
    resultFormat: param?.resultFormat ?? '', decimalPlaces: str(param?.decimalPlaces), required: param?.required ?? false,
    allowNegative: param?.allowNegative ?? false, technicalMin: str(param?.technicalMin), technicalMax: str(param?.technicalMax),
    referenceType: param?.referenceType ?? 'Range', displayReferenceText: param?.displayReferenceText ?? '',
    displayOrder: str(param?.displayOrder ?? nextOrder), active: param?.active ?? true, notes: param?.notes ?? '',
  });
  const s = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const num = f.dataType === 'Numeric';
  const dp = toNum(f.decimalPlaces), tmin = toNum(f.technicalMin), tmax = toNum(f.technicalMax), ord = toNum(f.displayOrder);
  const errs: Record<string, string> = {};
  if (!f.code.trim()) errs.code = 'Required';
  if (!f.name.trim()) errs.name = 'Required';
  if (num && dp !== null && (!Number.isInteger(dp) || dp < 0 || dp > 8)) errs.decimalPlaces = 'Integer 0–8';
  if (num && tmin !== null && Number.isNaN(tmin)) errs.technicalMin = 'Not a number';
  if (num && tmax !== null && Number.isNaN(tmax)) errs.technicalMax = 'Not a number';
  if (num && tmin !== null && tmax !== null && tmin > tmax) errs.technicalMax = 'Must be ≥ minimum';
  if (ord === null || Number.isNaN(ord)) errs.displayOrder = 'Required number';
  const submit = async () => {
    if (Object.keys(errs).length) return setErr('Fix the highlighted fields.');
    try {
      const saved = await lab.saveParameter.mutateAsync({
        data: {
          id: param?.id, testId, code: f.code.trim(), name: f.name.trim(), dataType: f.dataType, unit: f.unit,
          resultFormat: f.resultFormat, decimalPlaces: num ? dp : null, required: f.required,
          allowNegative: num ? f.allowNegative : false, technicalMin: num ? tmin : null, technicalMax: num ? tmax : null,
          referenceType: f.referenceType, displayReferenceText: f.displayReferenceText, displayOrder: ord as number,
          active: f.active, notes: f.notes,
        },
      });
      onSaved(saved);
    } catch (e) { setErr(msg(e)); }
  };
  const inp = (k: keyof typeof f, label: string, type = 'text', hint?: string) => (
    <Field label={label} error={errs[k]} hint={hint}>
      <input className={`input ${errs[k] ? 'err' : ''}`} type={type} step={type === 'number' ? 'any' : undefined} value={f[k] as string} onChange={(e) => s(k, e.target.value)} data-testid={`input-param-${k}`} />
    </Field>
  );
  return (
    <Modal wide title={param ? `Edit parameter ${param.code}` : 'New parameter'} onClose={onClose}
      footer={<ConfirmFoot onClose={onClose} onSave={submit} busy={lab.saveParameter.isPending} label={param ? 'Save parameter' : 'Add parameter'} />}>
      <div style={grid}>
        {inp('code', 'Code')}
        {inp('name', 'Name')}
        <Field label="Data type">
          <select className="select" value={f.dataType} onChange={(e) => s('dataType', e.target.value)} data-testid="select-param-dataType">
            {['Numeric', 'Text', 'Dropdown', 'Boolean', 'Date'].map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Reference type">
          <select className="select" value={f.referenceType} onChange={(e) => s('referenceType', e.target.value)} data-testid="select-param-referenceType">
            {['Range', 'Text', 'Decision Value', 'None'].map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        {inp('unit', 'Unit')}
        {inp('resultFormat', 'Result format')}
        {num && inp('decimalPlaces', 'Decimal places', 'number', '0 to 8, blank for unrestricted')}
        {num && inp('technicalMin', 'Technical minimum', 'number', 'Hard validation limit, not a reference interval')}
        {num && inp('technicalMax', 'Technical maximum', 'number')}
        {inp('displayReferenceText', 'Display reference text')}
        {inp('displayOrder', 'Display order', 'number')}
        <Field label="Notes (shown at result entry)" span={2}><textarea className="textarea" value={f.notes} onChange={(e) => s('notes', e.target.value)} data-testid="input-param-notes" /></Field>
        <div className="flex gap-5 col-span-2" style={{ gridColumn: 'span 2' }}>
          <Check checked={f.required} onChange={(v) => s('required', v)} label="Required" testId="check-param-required" />
          {num && <Check checked={f.allowNegative} onChange={(v) => s('allowNegative', v)} label="Allow negative" testId="check-param-negative" />}
          <Check checked={f.active} onChange={(v) => s('active', v)} label="Active" testId="check-param-active" />
        </div>
      </div>
      <Err e={err} />
    </Modal>
  );
}

export function OptionEditor({ parameterId, option, nextOrder, onClose }: { parameterId: number; option?: ParameterOption; nextOrder: number; onClose: () => void }) {
  const lab = useLab();
  const { err, setErr } = useSubmit();
  const [f, setF] = useState({ code: option?.code ?? '', label: option?.label ?? '', sortOrder: str(option?.sortOrder ?? nextOrder), abnormal: option?.abnormal ?? false, active: option?.active ?? true });
  const ord = toNum(f.sortOrder);
  const submit = async () => {
    if (!f.code.trim() || !f.label.trim() || ord === null || Number.isNaN(ord)) return setErr('Code, label and a numeric sort order are required.');
    try {
      await lab.saveOption.mutateAsync({ data: { id: option?.id, parameterId, code: f.code.trim(), label: f.label.trim(), sortOrder: ord, abnormal: f.abnormal, active: f.active } });
      onClose();
    } catch (e) { setErr(msg(e)); }
  };
  return (
    <Modal title={option ? 'Edit option' : 'New option'} subtitle="Abnormal drives the result flag. Nothing is assumed." onClose={onClose}
      footer={<ConfirmFoot onClose={onClose} onSave={submit} busy={lab.saveOption.isPending} />}>
      <div style={grid}>
        <Field label="Code"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} data-testid="input-option-code" /></Field>
        <Field label="Label"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} data-testid="input-option-label" /></Field>
        <Field label="Sort order"><input className="input" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} data-testid="input-option-sort" /></Field>
        <div className="flex gap-5 items-end">
          <Check checked={f.abnormal} onChange={(v) => setF({ ...f, abnormal: v })} label="Abnormal" testId="check-option-abnormal" />
          <Check checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" testId="check-option-active" />
        </div>
      </div>
      <Err e={err} />
    </Modal>
  );
}

export function MasterEditor({ kind, master, onClose }: { kind: 'Category' | 'Specimen' | 'Method'; master?: Master; onClose: () => void }) {
  const lab = useLab();
  const { err, setErr } = useSubmit();
  const [f, setF] = useState({ code: master?.code ?? '', name: master?.name ?? '', active: master?.active ?? true });
  const submit = async () => {
    if (!f.code.trim() || !f.name.trim()) return setErr('Code and name are required.');
    try {
      await lab.saveMaster.mutateAsync({ data: { id: master?.id, kind, code: f.code.trim(), name: f.name.trim(), active: f.active } });
      onClose();
    } catch (e) { setErr(msg(e)); }
  };
  return (
    <Modal title={`${master ? 'Edit' : 'New'} ${kind.toLowerCase()}`} onClose={onClose} footer={<ConfirmFoot onClose={onClose} onSave={submit} busy={lab.saveMaster.isPending} />}>
      <div style={grid}>
        <Field label="Code"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} data-testid="input-master-code" /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-master-name" /></Field>
        <Check checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" testId="check-master-active" />
      </div>
      <Err e={err} />
    </Modal>
  );
}
