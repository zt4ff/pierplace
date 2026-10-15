// Connects to the Python presence server (server/presence.py) and tracks other players.
const DEFAULT_URL = import.meta.env?.VITE_PRESENCE_URL || 'ws://localhost:8765';

export function connectPresence({ profile, floor, onEvent, url = DEFAULT_URL }) {
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
