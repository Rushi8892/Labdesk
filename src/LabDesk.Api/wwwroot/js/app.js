import { state, load, subscribe } from './store.js';
import { closeAllModals } from './modal.js';
import { html, setHTML, errorBlock } from './dom.js';

const routes = [
  [/^\/$/, 'tests'],
  [/^\/tests\/([^/]+)$/, 'test-detail', ['id']],
  [/^\/results$/, 'results'],
  [/^\/reports$/, 'reports'],
  [/^\/masters$/, 'masters'],
  [/^\/references$/, 'references'],
  [/^\/audit$/, 'audit'],
];
const navMatch = { tests: ['tests', 'test-detail'], results: ['results'], reports: ['reports'], masters: ['masters'], references: ['references'], audit: ['audit'] };

const main = document.getElementById('main');
const fragCache = new Map();
let current = null;
let currentName = '';
let token = 0;

async function fragment(name) {
  if (!fragCache.has(name)) {
    const res = await fetch(`pages/${name}.html`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Could not load page ${name}`);
    fragCache.set(name, await res.text());
  }
  return fragCache.get(name);
}

function crash(e) {
  console.error(e);
  setHTML(main, html`<div style="padding:0">${errorBlock('this page', 'reload-page')}</div>`);
  main.querySelector('[data-act="reload-page"]').addEventListener('click', () => route());
}

async function route() {
  const my = ++token;
  closeAllModals();
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0] || '/';
  let name = 'not-found';
  const params = {};
  for (const [re, n, keys] of routes) {
    const m = path.match(re);
    if (m) { name = n; (keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  document.querySelectorAll('#nav [data-nav]').forEach((a) => a.classList.toggle('on', navMatch[a.dataset.nav].includes(name)));
  try {
    const [frag, mod] = await Promise.all([fragment(name), name === 'not-found' ? null : import(`./pages/${name}.js`)]);
    if (my !== token) return;
    if (current?.destroy) current.destroy();
    current = null;
    main.innerHTML = frag; // trusted local fragment
    currentName = name;
    if (mod) current = mod.mount(main, params);
  } catch (e) {
    if (my === token) crash(e);
  }
}

function updateShell() {
  const set = (id, v) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    el.hidden = v === undefined;
    el.textContent = v ?? '';
  };
  const cat = state.catalog.data;
  const res = state.results.data;
  set('text-count-test-catalog', cat ? cat.tests.length : undefined);
  const open = (res ?? []).filter((r) => r.status === 'Draft').length;
  set('text-count-results', open || undefined);
  const un = (cat?.references ?? []).filter((r) => !r.approvedBy).length;
  set('text-count-references', un || undefined);
  const h = state.health;
  const ok = !!h.data?.status && !h.error;
  document.getElementById('health-dot').className = `dot ${ok ? 'ok' : h.loading || (!h.data && !h.error) ? '' : 'bad'}`;
  document.getElementById('health-text').textContent = ok ? 'Service reachable' : h.loading ? 'Checking service' : 'Service unreachable';
}

subscribe(() => {
  updateShell();
  if (current?.update) {
    try { current.update(); } catch (e) { crash(e); current = null; }
  }
});
window.addEventListener('hashchange', route);
updateShell();
load('health');
load('catalog');
load('results');
route();
void currentName;
