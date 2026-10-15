"""Table chat WebSocket rooms: `/ws/chat/{table_id}`.

A chat is a room keyed by the physical table tag. On connect the socket receives
the table's history so late joiners see older messages, then every message a
tablemate posts (via the REST endpoint) is fanned out to the room in real time.
One process serves both the REST API and these sockets, so the room registry is
a plain in-memory map shared with the REST handler.
"""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..db.session import SessionLocal
from ..services.lobby import get_or_create_table_chat, serialize_messages

router = APIRouter()

MAX_TAG = 64


class ChatRooms:
    """In-memory registry of table chat members, one set of sockets per table."""

    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {}

    def join(self, table_id: str, websocket: WebSocket) -> None:
        self.rooms.setdefault(table_id, set()).add(websocket)

    def leave(self, table_id: str, websocket: WebSocket) -> None:
        room = self.rooms.get(table_id)
        if not room:
            return
        room.discard(websocket)
        if not room:
            self.rooms.pop(table_id, None)

    def count(self, table_id: str) -> int:
        return len(self.rooms.get(table_id, ()))

    async def publish(self, table_id: str, message: dict) -> None:
        """Fan a single serialized message out to everyone in the room."""
        room = self.rooms.get(table_id)
        if not room:
            return
        payload = json.dumps({"type": "message", "message": message}, default=str)
        for websocket in list(room):
            try:
                await websocket.send_text(payload)
            except Exception:  # noqa: BLE001 - a dead socket must not stop the fan-out
                self.leave(table_id, websocket)


manager = ChatRooms()


@router.websocket("/ws/chat/{table_id}")
async def chat_socket(websocket: WebSocket, table_id: str) -> None:
    tag = (table_id or "").strip()
    if not tag or len(tag) > MAX_TAG:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    try:
        async with SessionLocal() as session:
            chat = await get_or_create_table_chat(session, tag)
            history = await serialize_messages(session, chat.id)
    except Exception:  # noqa: BLE001 - database unavailable: close cleanly
        await websocket.close()
        return

    await websocket.send_text(
        json.dumps({"type": "history", "messages": history}, default=str)
    )
    manager.join(tag, websocket)

    try:
        # Sending is handled by the REST endpoint; other frames are ignored.
        async for _ in websocket.iter_text():
            pass
    except WebSocketDisconnect:
        pass
    finally:
        manager.leave(tag, websocket)
