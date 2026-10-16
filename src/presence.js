// Read-only presence feed from the FastAPI backend (`/ws?token=<JWT>&run_id=<id>`).
// Positions are written via REST POST /location/move; this socket only receives
// `snapshot`, `presence.joined`, `presence.moved`, `presence.left` events.
// Fails silently (no connection) when no URL, token, or run id is available.
const NOOP = { close() {} };

function storage(key) {
  try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; }
}

function resolveUrl() {
  const env = import.meta.env || {};
  if (env.VITE_PRESENCE_URL) return env.VITE_PRESENCE_URL;
  const api = env.VITE_API_BASE;
  if (!api) return null;
  try {
    const u = new URL(api, globalThis.location?.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = `${u.pathname.replace(/\/$/, '')}/ws`;
    return u.toString();
  } catch { return null; }
}

export function connectPresence({ onEvent, token = storage('pierplace.token'), runId = storage('pierplace.run_id'), url = resolveUrl() } = {}) {
  if (!url || !token || !runId || typeof WebSocket === 'undefined') return NOOP;
  let socket;
  try {
    const u = new URL(url);
    u.searchParams.set('token', token);
    u.searchParams.set('run_id', runId);
    socket = new WebSocket(u.toString());
  } catch {
    return NOOP;
  }
  socket.onmessage = event => {
    try { onEvent?.(JSON.parse(event.data)); } catch { /* ignore bad frames */ }
  };
  socket.onerror = () => {}; // backend is optional; the campus still works offline
  return { close() { socket.close(); } };
}
