async function request(path, { signal, ...options } = {}) {
  const response = await fetch(`/api${path}`, { ...options, signal, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || `Request failed (${response.status}).`);
  return result;
}
export const api = {
  session: signal => request('/session', { signal }),
  admit: (profile, answers) => request('/admission', { method: 'POST', body: JSON.stringify({ profile, answers }) }),
  profile: profile => request('/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  floor: floor => request('/floor', { method: 'PUT', body: JSON.stringify({ floor }) }),
  completeLesson: id => request(`/lessons/${id}`, { method: 'POST' }),
  messages: (tableId, signal) => request(`/tables/${encodeURIComponent(tableId)}/messages`, { signal }),
  sendMessage: (tableId, text) => request(`/tables/${encodeURIComponent(tableId)}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
};
