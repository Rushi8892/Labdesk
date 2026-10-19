import { state, load } from '../store.js';
import { html, setHTML, pill, skeleton, empty, errorBlock, onAct } from '../dom.js';
import { openPatientEditor } from '../editors.js';

export function mount(root) {
  const $ = (s) => root.querySelector(s);

  function update() {
    const s = state.patients;
    const list = s.data ?? [];
    $('[data-slot="sub"]').textContent = s.data ? `${list.length} patients` : 'Loading patients';
    setHTML($('[data-slot="body"]'), html`
      ${s.loading ? skeleton(8) : ''}
      ${s.error ? errorBlock('the patient list') : ''}
      ${s.data && list.length === 0 ? empty('No patients yet', 'Register a patient, then create a result for them.', html`<button class="btn btn-primary" data-act="new-patient">New patient</button>`) : ''}
      ${list.length > 0 ? html`<table class="tbl">
        <thead><tr><th>Name</th><th>Age</th><th>Sex</th><th>Phone</th><th>Referred by</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((p) => html`<tr class="${p.active ? '' : 'off'}" data-testid="row-patient-${p.id}">
          <td class="sb">${p.name}</td>
          <td class="mono">${p.age}</td>
          <td>${p.sex}</td>
          <td class="mono">${p.phone || '\u2014'}</td>
          <td>${p.doctorName || '\u2014'}</td>
          <td>${pill(p.active ? 'pill-ok' : '', p.active ? 'Active' : 'Inactive')}</td>
          <td class="right nowrap"><button class="btn btn-sm" data-act="edit" data-id="${p.id}" data-testid="button-edit-patient-${p.id}">Edit</button></td>
        </tr>`)}</tbody></table>` : ''}`);
  }

  const find = (id) => (state.patients.data ?? []).find((p) => p.id === id);
  const off = onAct(root, {
    'new-patient': () => openPatientEditor({}),
    edit: (el) => { const p = find(Number(el.dataset.id)); if (p) openPatientEditor({ patient: p }); },
    retry: () => load('patients'),
  });
  load('patients');
  load('doctors');
  update();
  return { update, destroy: off };
}
