async function req(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Service unreachable');
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const m = data && typeof data === 'object' && (data.error || data.title || data.detail);
    throw new Error(m ? String(m) : `Request failed (${res.status})`);
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.error === 'string' && Object.keys(data).length === 1) throw new Error(data.error);
  return data;
}

export const api = {
  health: () => req('GET', '/api/healthz'),
  lab: () => req('GET', '/api/lab'),
  catalog: () => req('GET', '/api/catalog'),
  results: () => req('GET', '/api/results'),
  audit: () => req('GET', '/api/audit'),
  patients: () => req('GET', '/api/patients'),
  doctors: () => req('GET', '/api/doctors'),
  report: (id) => req('GET', `/api/results/${encodeURIComponent(id)}/report`),
  saveTest: (d) => req('POST', '/api/tests', d),
  saveParameter: (d) => req('POST', '/api/parameters', d),
  saveOption: (d) => req('POST', '/api/options', d),
  savePatient: (d) => req('POST', '/api/patients', d),
  saveMaster: (d) => req('POST', '/api/masters', d),
  saveResult: (d) => req('POST', '/api/results', d),
};
