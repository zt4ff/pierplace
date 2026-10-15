"""Consolidated presence WebSocket (was `server/presence.py`).

Runs on the same ASGI app as the REST API, so one command serves both. On join
the character profile is persisted to Postgres; movement is fanned out to every
other connected player in real time.
"""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..db.session import SessionLocal
from ..services.players import upsert_player

router = APIRouter()


class ConnectionManager:
    """In-memory presence registry: one entry per live socket."""

    def __init__(self) -> None:
        self.connections: dict[WebSocket, dict] = {}

    def add(self, websocket: WebSocket, state: dict) -> None:
        self.connections[websocket] = state

    def remove(self, websocket: WebSocket) -> dict | None:
        return self.connections.pop(websocket, None)

    def snapshot(self) -> list[dict]:
        return [dict(state) for state in self.connections.values()]

    def seated_elsewhere(self, player_id: str, table_id: str) -> bool:
        """True only when we know this player is seated at a *different* table.

        Unknown players (late socket, reconnect gap) are never blocked.
        """
        for state in self.connections.values():
            if state["id"] != player_id:
                continue
            return bool(
                state.get("seated")
                and state.get("tableId")
                and state["tableId"] != table_id
            )
        return False

    async def broadcast(self, message: dict, skip: WebSocket | None = None) -> None:
        payload = json.dumps(message, default=str)
        for websocket in list(self.connections):
            if websocket is skip:
                continue
            try:
                await websocket.send_text(payload)
            except Exception:  # noqa: BLE001 - a dead socket must not stop the fan-out
                self.connections.pop(websocket, None)


manager = ConnectionManager()

MOVE_KEYS = ("x", "y", "seated", "tableId", "floor")


@router.websocket("/ws")
async def presence_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        hello = json.loads(await websocket.receive_text())
    except (WebSocketDisconnect, json.JSONDecodeError):
        await websocket.close()
        return
    if hello.get("type") != "join":
        await websocket.close()
        return

    async with SessionLocal() as session:
        user = await upsert_player(session, hello.get("profile"))
        player_id = str(user.id)
        profile = {
            "name": user.display_name,
            "skin": user.skin,
            "hair": user.hair,
            "shirt": user.shirt,
        }

    try:
        floor = int(hello.get("floor", 1))
    except (TypeError, ValueError):
        floor = 1
    me = {
        "id": player_id,
        "profile": profile,
        "floor": floor,
        "x": 0,
        "y": 0,
        "seated": False,
        "tableId": None,
    }

    await websocket.send_text(
        json.dumps(
            {"type": "welcome", "id": player_id, "profile": profile, "players": manager.snapshot()}
        )
    )
    manager.add(websocket, me)
    await manager.broadcast({"type": "joined", "player": dict(me)}, skip=websocket)

    try:
        async for raw in websocket.iter_text():
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if message.get("type") != "move":
                continue
            for key in MOVE_KEYS:
                if key in message:
                    me[key] = message[key]
            await manager.broadcast(
                {"type": "moved", "id": player_id, **{key: me[key] for key in MOVE_KEYS}},
                skip=websocket,
            )
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(websocket)
        await manager.broadcast({"type": "left", "id": player_id})
