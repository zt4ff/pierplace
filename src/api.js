async function request(path, { signal, ...options } = {}) {
  const response = await fetch(`/api${path}`, { ...options, signal, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || `Request failed (${response.status}).`);
  return result;
}
const identityQuery = identity => {
  const params = new URLSearchParams();
  if (identity?.playerId) params.set('playerId', identity.playerId);
  const query = params.toString();
  return query ? `?${query}` : '';
};
export const api = {
  session: signal => request('/session', { signal }),
  admit: (profile, answers) => request('/admission', { method: 'POST', body: JSON.stringify({ profile, answers }) }),
  profile: profile => request('/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  floor: floor => request('/floor', { method: 'PUT', body: JSON.stringify({ floor }) }),
  completeLesson: id => request(`/lessons/${id}`, { method: 'POST' }),
  messages: (tableId, identity, signal) => request(`/tables/${encodeURIComponent(tableId)}/messages${identityQuery(identity)}`, { signal }),
  sendMessage: (tableId, text, identity = {}) => request(`/tables/${encodeURIComponent(tableId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, playerId: identity.playerId, name: identity.name, skin: identity.skin, hair: identity.hair, shirt: identity.shirt }),
  }),
  getQuestTasks: (params = {}) => {
    const query = new URLSearchParams();
    if (params.week) query.set('week', params.week);
    if (params.quest_number) query.set('quest_number', params.quest_number);
    const q = query.toString();
    return request(`/quests/tasks${q ? `?${q}` : ''}`);
  },
  trainProgress: name => request(`/quests/train/progress?name=${encodeURIComponent(name)}`),
  submitTrainQuest: (taskId, code, identity = {}) => request('/quests/train/submit', {
    method: 'POST',
    body: JSON.stringify({
      task_id: taskId,
      code,
      name: identity.name,
      skin: identity.skin,
      hair: identity.hair,
      shirt: identity.shirt,
    }),
  }),
};
