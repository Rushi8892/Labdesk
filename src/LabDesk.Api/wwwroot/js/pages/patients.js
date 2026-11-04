import { state, load, mutate } from '../store.js';
import { api } from '../api.js';
import { html, setHTML, pill, skeleton, empty, errorBlock, onAct } from '../dom.js';
import { openPatientEditor, openDoctorEditor } from '../editors.js';

const TABS = [['patients', 'Patients'], ['doctors', 'Doctors']];

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  let tab = 'patients';
  let busy = false;

  function update() {
    const ps = state.patients;
    const ds = state.doctors;
    const patients = ps.data ?? [];
    const doctors = ds.data ?? [];
    const onPatients = tab === 'patients';
    const counts = { patients: ps.data ? patients.length : '', doctors: ds.data ? doctors.length : '' };
    $('[data-slot="newlabel"]').textContent = onPatients ? 'New patient' : 'New doctor';
    $('[data-slot="sub"]').textContent = onPatients
      ? (ps.data ? `${patients.length} patients` : 'Loading patients')
      : (ds.data ? `${doctors.length} doctors` : 'Loading doctors');
    setHTML($('[data-slot="tabs"]'), TABS.map(([k, l]) => html`<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-k="${k}" data-testid="tab-${k}">${l} <span class="mono" style="opacity:.6">${counts[k]}</span></button>`));
    setHTML($('[data-slot="body"]'), onPatients ? html`
      ${ps.loading ? skeleton(8) : ''}
      ${ps.error ? errorBlock('the patient list') : ''}
      ${ps.data && patients.length === 0 ? empty('No patients yet', 'Register a patient, then create a result for them.', html`<button class="btn btn-primary" data-act="new" data-testid="button-empty-new-patient">New patient</button>`) : ''}
      ${patients.length > 0 ? html`<table class="tbl">
        <thead><tr><th>Name</th><th>Age</th><th>Sex</th><th>Phone</th><th>Referred by</th><th>Status</th><th></th></tr></thead>
        <tbody>${patients.map((p) => html`<tr class="${p.active ? '' : 'off'}" data-testid="row-patient-${p.id}">
          <td class="sb">${p.name}</td>
          <td class="mono">${p.age}</td>
          <td>${p.sex}</td>
          <td class="mono">${p.phone || '\u2014'}</td>
          <td>${p.doctorName || '\u2014'}</td>
          <td>${pill(p.active ? 'pill-ok' : '', p.active ? 'Active' : 'Inactive')}</td>
          <td class="right nowrap"><a class="btn btn-sm" href="#/patients/${p.id}" data-testid="button-view-patient-${p.id}">View</a> <button class="btn btn-sm" data-act="edit" data-id="${p.id}" data-testid="button-edit-patient-${p.id}">Edit</button></td>
        </tr>`)}</tbody></table>` : ''}` : html`
      ${ds.loading ? skeleton(4) : ''}
      ${ds.error ? errorBlock('the doctor list') : ''}
      ${ds.data && doctors.length === 0 ? empty('No doctors yet', 'Add one so a patient can record who referred them.', html`<button class="btn btn-primary" data-act="new" data-testid="button-empty-new-doctor">Add doctor</button>`) : ''}
      ${doctors.length > 0 ? html`<table class="tbl">
        <thead><tr><th>Name</th><th>Patients using</th><th>Status</th><th></th></tr></thead>
        <tbody>${doctors.map((d) => html`<tr class="${d.active ? '' : 'off'}" data-testid="row-doctor-${d.id}">
          <td class="sb">${d.name}</td>
          <td class="mono">${patients.filter((p) => p.doctorId === d.id).length}</td>
          <td>${pill(d.active ? 'pill-ok' : '', d.active ? 'Active' : 'Inactive')}</td>
          <td class="right nowrap"><button class="btn btn-sm" data-act="edit-doctor" data-id="${d.id}" data-testid="button-edit-doctor-${d.id}">Edit</button>
            <button class="btn btn-sm" data-act="toggle-doctor" data-id="${d.id}"${busy ? html` disabled` : ''} data-testid="button-toggle-doctor-${d.id}">${d.active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>`)}</tbody></table>` : ''}`);
  }

  const findPatient = (id) => (state.patients.data ?? []).find((p) => p.id === id);
  const findDoctor = (id) => (state.doctors.data ?? []).find((d) => d.id === id);
  const off = onAct(root, {
    tab: (el) => { tab = el.dataset.k; update(); },
    new: () => (tab === 'patients' ? openPatientEditor({}) : openDoctorEditor()),
    edit: (el) => { const p = findPatient(Number(el.dataset.id)); if (p) openPatientEditor({ patient: p }); },
    'edit-doctor': (el) => { const d = findDoctor(Number(el.dataset.id)); if (d) openDoctorEditor({ doctor: d }); },
    'toggle-doctor': async (el) => {
      const d = findDoctor(Number(el.dataset.id));
      if (!d || busy) return;
      busy = true; update();
      try { await mutate(() => api.saveDoctor({ ...d, active: !d.active })); } catch { /* toasted */ }
      busy = false; update();
    },
    retry: () => load(tab),
  });
  load('patients');
  load('doctors');
  update();
  return { update, destroy: off };
}
