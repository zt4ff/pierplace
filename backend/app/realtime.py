"""In-process WebSocket presence fan-out (read-only broadcast relay).

Per docs/piscine-backend-contract.md the socket never carries writes: position
truth lives in REST POST /location/move, which calls ``manager.broadcast`` after
commit. Reconnect = fresh snapshot.

Caveat: connections live in this process's memory, so fan-out only reaches
clients connected to the same worker. Multi-worker deploys need a shared bus
(e.g. Postgres LISTEN/NOTIFY or Redis pub/sub).
"""

import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[WebSocket, str]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def add(self, run_id: str, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._rooms[run_id][ws] = user_id

    async def remove(self, run_id: str, ws: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(run_id)
            if room is not None:
                room.pop(ws, None)
                if not room:
                    self._rooms.pop(run_id, None)

    def count(self, run_id: str) -> int:
        return len(self._rooms.get(run_id, {}))

    async def broadcast(self, run_id: str, message: dict, exclude: WebSocket | None = None) -> None:
        targets = [ws for ws in list(self._rooms.get(run_id, {})) if ws is not exclude]
        dead = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.remove(run_id, ws)

    async def send_to_user(self, run_id: str, user_id: str, message: dict) -> None:
        for ws, uid in list(self._rooms.get(run_id, {}).items()):
            if uid == user_id:
                try:
                    await ws.send_json(message)
                except Exception:
                    await self.remove(run_id, ws)


manager = ConnectionManager()
