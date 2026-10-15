import { html, setHTML, icon, esc } from './dom.js';
import { msg } from './lab.js';

const open = new Set();
export function closeAllModals() { [...open].forEach((m) => m.close()); }

// Opens a dialog. onSave(ctx) must call ctx.close() on success; throwing shows the error and keeps the dialog open.
export function openModal({ title, subtitle, wide, body, saveLabel = 'Save', onSave, onMount, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'overlay no-print';
  setHTML(ov, html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><div><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-m="close" aria-label="Close" data-testid="button-close-modal">${icon.x(14)}</button></div>
    <div class="modal-body scroll"><div data-m="content">${body}</div><div data-m="err"></div></div>
    <div class="modal-foot"><button type="button" class="btn" data-m="close" data-testid="button-cancel">Cancel</button><button type="button" class="btn btn-primary" data-m="save" data-testid="button-save">${saveLabel}</button></div>
  </div>`);
  const saveBtn = ov.querySelector('[data-m="save"]');
  const errHost = ov.querySelector('[data-m="err"]');
  let busy = false;
  let closed = false;
  const ctx = {
    root: ov.querySelector('[data-m="content"]'),
    setErr(e) {
      if (closed) return;
      errHost.innerHTML = e ? `<div class="form-error" data-testid="text-form-error">${esc(e)}</div>` : '';
    },
    close() {
      if (closed) return;
      closed = true;
      open.delete(ctx);
      window.removeEventListener('keydown', key);
      ov.remove();
      if (onClose) onClose();
    },
    async save() {
      if (busy || closed) return;
      busy = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving\u2026';
      try { await onSave(ctx); } catch (e) { ctx.setErr(msg(e)); }
      busy = false;
      if (!closed) { saveBtn.disabled = false; saveBtn.textContent = saveLabel; }
    },
  };
  const key = (e) => { if (e.key === 'Escape') ctx.close(); };
  window.addEventListener('keydown', key);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) ctx.close(); });
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    if (b.dataset.m === 'close') ctx.close();
    else if (b.dataset.m === 'save') ctx.save();
  });
  document.getElementById('modals').appendChild(ov);
  open.add(ctx);
  if (onMount) onMount(ctx);
  return ctx;
}
