import { api } from './api.js';
import { indexCatalog, msg } from './lab.js';
import { toast } from './dom.js';

const mk = () => ({ data: null, error: null, loading: false, seq: 0 });
export const state = { catalog: mk(), results: mk(), patients: mk(), doctors: mk(), audit: mk(), health: mk() };
const loaders = {
  catalog: api.catalog, results: api.results, patients: api.patients, doctors: api.doctors,
  audit: api.audit, health: api.health,
};
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

export async function load(key) {
  const s = state[key];
  const seq = ++s.seq;
  if (!s.data) s.loading = true;
  s.error = null;
  emit();
  try {
    const d = await loaders[key]();
    if (seq !== s.seq) return;
    s.data = d;
    if (key === 'catalog') s.ix = indexCatalog(d || {});
  } catch (e) {
    if (seq !== s.seq) return;
    s.error = e;
  }
  s.loading = false;
  emit();
}

export function reloadAll() {
  const keys = ['catalog', 'results'];
  // Only refresh a list some page has already asked for; health never.
  for (const key of ['patients', 'doctors', 'audit']) {
    if (state[key].data || state[key].error) keys.push(key);
  }
  return Promise.all(keys.map(load));
}

// Runs a mutation, then refreshes catalog/worklist/audit; toasts errors and rethrows.
export async function mutate(fn) {
  try {
    const r = await fn();
    await reloadAll();
    return r;
  } catch (e) {
    toast('Request failed', msg(e), true);
    throw e;
  }
}
