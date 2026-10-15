"""In-memory WebSocket managers: presence fan-out and chat rooms.

These exercise the registries directly (no Postgres), mirroring how the routes
use them: one presence registry for players, one chat registry per table.
"""

import asyncio
import json

from app.ws.chat import ChatRooms
from app.ws.presence import ConnectionManager


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent.append(text)


class DeadSocket:
    async def send_text(self, text: str) -> None:
        raise RuntimeError("socket closed")


def test_presence_broadcast_skips_sender_and_prunes_dead_sockets():
    async def scenario():
        manager = ConnectionManager()
        sender, listener, dead = FakeSocket(), FakeSocket(), DeadSocket()
        manager.add(sender, {"id": "sender"})
        manager.add(listener, {"id": "listener"})
        manager.add(dead, {"id": "dead"})

        await manager.broadcast({"type": "moved", "id": "sender"}, skip=sender)
        assert dead not in manager.connections
        assert [json.loads(frame) for frame in listener.sent] == [
            {"type": "moved", "id": "sender"}
        ]
        assert sender.sent == []

    asyncio.run(scenario())


def test_chat_rooms_publish_history_shape_is_per_table():
    async def scenario():
        rooms = ChatRooms()
        member, other_table, dead = FakeSocket(), FakeSocket(), DeadSocket()
        rooms.join("floor-1-west-1", member)
        rooms.join("floor-1-west-1", dead)
        rooms.join("floor-2-west-1", other_table)
        assert rooms.count("floor-1-west-1") == 2
        assert rooms.count("floor-2-west-1") == 1

        await rooms.publish("floor-1-west-1", {"id": "m1", "name": "Ada", "text": "hi"})

        assert dead not in rooms.rooms["floor-1-west-1"]
        assert [json.loads(frame) for frame in member.sent] == [
            {"type": "message", "message": {"id": "m1", "name": "Ada", "text": "hi"}}
        ]
        assert other_table.sent == []  # messages never cross tables

        rooms.leave("floor-1-west-1", member)
        assert rooms.count("floor-1-west-1") == 0
        assert "floor-1-west-1" not in rooms.rooms

    asyncio.run(scenario())
