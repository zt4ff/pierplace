import { PRESENCE_URL } from './config.js';

// Connects to the backend presence WebSocket (FastAPI `app/ws/presence.py`).
// Tracks other players in real time. The URL follows the REST API base
// (VITE_API_BASE) and can be overridden with VITE_PRESENCE_URL.
function defaultUrl() {
  return PRESENCE_URL;
}

/** Socket for one table's chat room, on the same origin as presence. */
export function chatSocketUrl(tableId) {
  return `${defaultUrl()}/chat/${encodeURIComponent(tableId)}`;
}

export function connectPresence({ profile, floor, onEvent, url = defaultUrl() }) {
  let socket;
  try {
    socket = new WebSocket(url);
  } catch {
    return { sendMove() {}, close() {} };
  }
  socket.onopen = () => socket.send(JSON.stringify({
    type: 'join',
    profile: { name: profile?.name, skin: profile?.skin, hair: profile?.hair, shirt: profile?.shirt },
    floor,
  }));
  socket.onmessage = event => {
    try { onEvent?.(JSON.parse(event.data)); } catch { /* ignore bad frames */ }
  };
  socket.onerror = () => {}; // server is optional; the campus still works offline
  return {
    sendMove(move) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'move', ...move }));
    },
    close() { socket.close(); },
  };
}
