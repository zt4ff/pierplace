import { PRESENCE_URL } from './config.js';

// Read-only presence feed from the FastAPI backend (`app/ws/presence.py`),
// connected as `/ws?token=<JWT>&run_id=<id>`. Positions are written via REST
// `POST /location/move`; this socket only receives `snapshot`,
// `presence.joined`, `presence.moved`, `presence.left` and `presence.rejected`.
// The client never sends profile or position writes. Stays offline (no-op)
// when no token or run id is stored. URL follows VITE_API_BASE, override with
// VITE_PRESENCE_URL.
const NOOP = { close() {} };

function storage(key) {
  try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; }
}

function defaultUrl() {
  return PRESENCE_URL;
}

/** Socket for one table's chat room, on the same origin as presence. */
export function chatSocketUrl(tableId) {
  return `${defaultUrl()}/chat/${encodeURIComponent(tableId)}`;
}

export function connectPresence({
  onEvent,
  token = storage('pierplace.token'),
  runId = storage('pierplace.run_id'),
  url = defaultUrl(),
} = {}) {
  if (!url || !token || !runId || typeof WebSocket === 'undefined') return NOOP;
  let socket;
  try {
    const u = new URL(url, globalThis.location?.href);
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
