// Shared helpers for the new modules
const API = location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new Error('Cannot reach the server. Start the backend (npm start) and open http://localhost:3000'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}
const val = id => document.getElementById(id).value.trim();
const when = t => new Date(t.replace(' ', 'T') + 'Z').toLocaleString();
