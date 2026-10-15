// Connects to the backend presence WebSocket (FastAPI `app/ws/presence.py`,
// served on the same origin as the REST API). Tracks other players in real time.
function defaultUrl() {
  if (import.meta.env?.VITE_PRESENCE_URL) return import.meta.env.VITE_PRESENCE_URL;
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }
  return 'ws://localhost:8000/ws';
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
