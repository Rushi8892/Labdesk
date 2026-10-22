// Safe HTML templating: every interpolated value is escaped unless it is a Safe produced by html``.
export class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (v) => String(v).replace(/[&<>"'`]/g, (c) => MAP[c]);
function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let o = strings[0];
  vals.forEach((v, i) => { o += part(v) + strings[i + 1]; });
  return new Safe(o);
}
export function setHTML(el, content) { el.innerHTML = part(content); }

const svg = (d, size = 14) => new Safe(`<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);
export const icon = {
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s),
  x: (s) => svg('<path d="M18 6 6 18M6 6l12 12"/>', s),
  up: (s) => svg('<path d="m5 12 7-7 7 7M12 19V5"/>', s),
  down: (s) => svg('<path d="M12 5v14M19 12l-7 7-7-7"/>', s),
  left: (s) => svg('<path d="m12 19-7-7 7-7M19 12H5"/>', s),
  alert: (s) => svg('<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>', s),
  printer: (s) => svg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>', s),
  phone: (s) => svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>', s),
};

// The lab name as a gradient wordmark. Drawn as SVG text, not a CSS
// background-clip, because Chromium prints clipped-text backgrounds as a solid
// block: the handout would carry a coloured bar instead of the lab's name.
const MARK_STOPS = ['#e0006f', '#7d1b86', '#5d1f8d', '#2b2a8f', '#1f2f92', '#17399b', '#1257c2', '#1091d3', '#1cc6dc'];
const MARK_AT = [0, 26, 40, 52, 58, 66, 78, 88, 100];
let markSeq = 0;
export function wordmark(name, size = 30, testid) {
  const id = `wm${++markSeq}`;
  const label = esc(name);
  let width;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `900 ${size}px "Segoe UI Black", "Segoe UI", sans-serif`;
    width = Math.ceil(ctx.measureText(String(name)).width) + 2;
  } catch {
    width = Math.ceil(String(name).length * size * 0.6);
  }
  const height = Math.ceil(size * 1.15);
  const stops = MARK_STOPS.map((c, i) => `<stop offset="${MARK_AT[i]}%" stop-color="${c}"/>`).join('');
  return new Safe(`<svg class="wordmark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"${testid ? ` data-testid="${testid}"` : ''}><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs><text x="0" y="${Math.round(size * 0.84)}" font-family="Segoe UI Black, Segoe UI, sans-serif" font-size="${size}" font-weight="900" fill="url(#${id})">${label}</text></svg>`);
}

export const pill = (tone, text, testid) => html`<span class="pill ${tone || ''}"${testid ? html` data-testid="${testid}"` : ''}>${text}</span>`;export const dash = () => html`<span class="muted">\u2014</span>`;

export function skeleton(rows = 8) {
  return html`<div class="skel-wrap">${Array.from({ length: rows }, (_, i) => html`<div class="skel" style="width:${95 - ((i * 13) % 40)}%;animation-delay:${i * 60}ms"></div>`)}</div>`;
}
export function empty(title, body, action) {
  return html`<div class="empty"><div class="t">${title}</div>${body ? html`<p>${body}</p>` : ''}${action ? html`<div class="a">${action}</div>` : ''}</div>`;
}
export function errorBlock(what, act = 'retry') {
  return html`<div class="panel errblock">${icon.alert(22)}<div style="flex:1"><div class="b">Could not load ${what}</div><div class="muted xs">The service did not respond as expected.</div></div><button class="btn" data-act="${act}" data-testid="button-retry">Retry</button></div>`;
}

export function toast(title, description, destructive = false) {
  const host = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast${destructive ? ' destructive' : ''}`;
  t.setAttribute('role', 'status');
  setHTML(t, html`<div class="sb">${title}</div>${description ? html`<div class="d">${description}</div>` : ''}`);
  host.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// Delegated click handling by data-act attribute.
export function onAct(root, handlers) {
  const h = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.act];
    if (fn) fn(el, e);
  };
  root.addEventListener('click', h);
  return () => root.removeEventListener('click', h);
}

export function fillSelect(sel, first, items) {
  const cur = sel.value;
  setHTML(sel, html`<option value="">${first}</option>${items.map((m) => html`<option value="${m.value}">${m.label}</option>`)}`);
  sel.value = items.some((m) => String(m.value) === cur) ? cur : '';
}
