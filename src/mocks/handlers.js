import { http, HttpResponse, delay } from 'msw';
import { freshState, loadState, saveState, QUESTIONS, isCorrect, COLORS } from '../state.js';

export function createMockStore(storage) {
  let state = storage ? loadState(storage) : freshState();
  let persistent = Boolean(storage);
  return {
    get: () => structuredClone(state),
    update: patch => {
      state = { ...state, ...patch };
      persistent = storage ? saveState(storage, state) : false;
      return structuredClone(state);
    },
    isPersistent: () => persistent,
  };
}
const validTable = id => typeof id === 'string' && /^floor-[12]-(west-[12]|center-[12]|east-[1-4]|east-lower-[1-3]|relaxation)$/.test(id);
function validProfile(profile) {
  return profile && typeof profile.name === 'string' && profile.name.trim().length > 0 && profile.name.trim().length <= 24 &&
    ['skin', 'hair', 'shirt'].every(key => COLORS[key].includes(profile[key])) && typeof profile.wearId === 'boolean' &&
    (profile.photo === null || (typeof profile.photo === 'string' && profile.photo.length < 500000 && /^data:image\/(png|jpeg|webp);base64,/.test(profile.photo)));
}
const error = (message, status = 400) => HttpResponse.json({ message }, { status });
const REPLIES = ['Hey! Glad you pulled up a chair. What are you learning today?', 'Small steps count. Have you opened the campus laptop yet?', 'I like that idea. Write it down in Notes so you can come back to it.'];
export function createHandlers(store, latency = 220) {
  const sessionResponse = () => HttpResponse.json({ ...store.get(), persistent: store.isPersistent() });
  return [
    http.get('*/api/session', async () => { await delay(latency); return sessionResponse(); }),
    http.post('*/api/admission', async ({ request }) => {
      await delay(latency);
      const { profile, answers } = await request.json();
      if (!validProfile(profile)) return error('Please check your profile details.');
      if (!Array.isArray(answers) || answers.length !== QUESTIONS.length || !QUESTIONS.every((q, index) => isCorrect(q, answers[index]))) return error('Solve all three visual puzzles to get your campus pass.');
      store.update({ profile: { ...profile, name: profile.name.trim() }, admitted: true });
      return sessionResponse();
    }),
    http.put('*/api/profile', async ({ request }) => {
      await delay(latency);
      const profile = await request.json();
      if (!store.get().admitted) return error('Get your campus pass first.', 403);
      if (!validProfile(profile)) return error('Please check your profile details.');
      store.update({ profile: { ...profile, name: profile.name.trim() } });
      return sessionResponse();
    }),
    http.put('*/api/floor', async ({ request }) => {
      await delay(latency);
      const { floor } = await request.json();
      if (![1, 2].includes(floor)) return error('Choose floor 1 or floor 2.');
      store.update({ floor });
      return HttpResponse.json({ floor });
    }),
    http.post('*/api/lessons/:id', async ({ params }) => {
      await delay(latency);
      if (!['welcome', 'web', 'design'].includes(params.id)) return error('Lesson not found.', 404);
      if (!store.get().admitted) return error('Get your campus pass first.', 403);
      const lessons = [...new Set([...store.get().lessons, params.id])];
      store.update({ lessons });
      return HttpResponse.json({ lessons });
    }),
    http.get('*/api/tables/:id/messages', async ({ params }) => {
      await delay(latency);
      if (!validTable(params.id)) return error('Table not found.', 404);
      if (!store.get().admitted) return error('Get your campus pass first.', 403);
      return HttpResponse.json({ messages: store.get().chats[params.id] || [] });
    }),
    http.post('*/api/tables/:id/messages', async ({ params, request }) => {
      await delay(latency + 250);
      if (!validTable(params.id)) return error('Table not found.', 404);
      const current = store.get();
      if (!current.admitted) return error('Get your campus pass first.', 403);
      const { text } = await request.json();
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 500) return error('Write a message between 1 and 500 characters.');
      const messages = current.chats[params.id] || [];
      const replyIndex = messages.filter(message => message.name === 'Campus buddy · mock').length % REPLIES.length;
      const time = new Date().toISOString();
      const next = [...messages, { name: current.profile.name, text: text.trim(), time }, { name: 'Campus buddy · mock', text: REPLIES[replyIndex], time }].slice(-100);
      store.update({ chats: { ...current.chats, [params.id]: next } });
      return HttpResponse.json({ messages: next }, { status: 201 });
    }),
  ];
}
