import { html } from './dom.js';

export function field(k, label, control, { span = 1, hint = '', extra = '' } = {}) {
  return html`<label class="field" data-field="${k}" style="grid-column: span ${span}"${extra ? html` ${extra}` : ''}><span class="lbl">${label}</span>${control}<span class="field-msg" data-hint="${hint}">${hint}</span></label>`;
}
export function input(k, value, { type = 'text', testid, list, cls = '' } = {}) {
  return html`<input class="input ${cls}" data-k="${k}" type="${type}"${type === 'number' ? html` step="any"` : ''}${list ? html` list="${list}"` : ''} value="${value}" data-testid="${testid}">`;
}
export function textarea(k, value, testid) {
  return html`<textarea class="textarea" data-k="${k}" data-testid="${testid}">${value}</textarea>`;
}
export function select(k, value, options, { testid, disabled } = {}) {
  return html`<select class="select" data-k="${k}" data-testid="${testid}"${disabled ? html` disabled` : ''}>${options.map((o) => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return html`<option value="${v}"${String(v) === String(value) ? html` selected` : ''}>${l}</option>`;
  })}</select>`;
}
export function check(k, checked, label, testid) {
  return html`<label class="check"><input type="checkbox" data-k="${k}"${checked ? html` checked` : ''} data-testid="${testid}"><span>${label}</span></label>`;
}

// Binds inputs with data-k to object f and revalidates the editor as values change.
export function bindForm(root, f, validate, after) {
  const refresh = () => {
    const errs = validate(f);
    root.querySelectorAll('[data-field]').forEach((w) => {
      const k = w.dataset.field;
      const m = w.querySelector('.field-msg');
      const ctl = w.querySelector('[data-k]');
      const e = errs[k];
      if (ctl && (ctl.matches('input:not([type=checkbox])') || ctl.matches('select'))) ctl.classList.toggle('err', !!e);
      m.textContent = e || m.dataset.hint;
      m.classList.toggle('bad', !!e);
    });
    if (after) after(f, errs);
    return errs;
  };
  const h = (ev) => {
    const el = ev.target.closest('[data-k]');
    if (!el || !root.contains(el)) return;
    f[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    refresh();
  };
  root.addEventListener('input', h);
  root.addEventListener('change', h);
  refresh();
  return refresh;
}
