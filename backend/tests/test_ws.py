"""WebSocket presence tests; DB loaders are monkeypatched so no Postgres is needed."""

import asyncio
import json
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_token
from app.main import app
from app.ws import presence as ws_router
from app.ws.presence import ConnectionManager


def _user(name):
    return SimpleNamespace(id=uuid.uuid4(), display_name=name, skin="#111111", hair="#222222", shirt="#333333")


@pytest.fixture
def users(monkeypatch):
    table = {}

    async def load_user(uid):
        return table.get(uid)

    async def load_snapshot(run_id):
        return [{"user": uid, "floor": "f1", "seat": None, "beanbag": None, "lock": "free",
                 "display_name": u.display_name, "character": {}} for uid, u in table.items()]

    monkeypatch.setattr(ws_router, "load_user", load_user)
    monkeypatch.setattr(ws_router, "load_snapshot", load_snapshot)
    return table


def test_rejects_bad_token(users):
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws?token=garbage&run_id=r1") as s:
            s.receive_json()
    assert exc.value.code == 4401


def test_rejects_unknown_user(users):
    client = TestClient(app)
    tok = create_token(str(uuid.uuid4()), "candidate")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws?token={tok}&run_id=r1") as s:
            s.receive_json()
    assert exc.value.code == 4401


def test_snapshot_join_leave_and_read_only(users):
    a, b = _user("Ada"), _user("Bo")
    users[str(a.id)] = a
    users[str(b.id)] = b
    client = TestClient(app)
    ta, tb = create_token(str(a.id), "candidate"), create_token(str(b.id), "candidate")
    with client.websocket_connect(f"/ws?token={ta}&run_id=r1") as sa:
        snap = sa.receive_json()
        assert snap["type"] == "snapshot" and len(snap["players"]) == 2
        with client.websocket_connect(f"/ws?token={tb}&run_id=r1") as sb:
            assert sb.receive_json()["type"] == "snapshot"
            joined = sa.receive_json()
            assert joined["type"] == "presence.joined" and joined["user"] == str(b.id)
            sb.send_json({"type": "move", "floor": "f2"})
            assert sb.receive_json() == {"type": "error", "reason": "read_only_socket"}
            sb.send_json({"type": "ping"})
            assert sb.receive_json() == {"type": "pong"}
        left = sa.receive_json()
        assert left == {"type": "presence.left", "id": str(b.id), "user": str(b.id)}


class FakeWS:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    async def send_text(self, m):
        if self.fail:
            raise RuntimeError("closed")
        self.sent.append(json.loads(m))


def test_manager_broadcast_scoping():
    async def run():
        m = ConnectionManager()
        a, b, c, dead = FakeWS(), FakeWS(), FakeWS(), FakeWS(fail=True)
        m.add(a, {"id": "ua", "run_id": "r1"})
        m.add(b, {"id": "ub", "run_id": "r1"})
        m.add(c, {"id": "uc", "run_id": "r2"})
        m.add(dead, {"id": "ud", "run_id": "r1"})
        await m.broadcast({"type": "x"}, skip=a, run_id="r1")
        assert a.sent == [] and b.sent == [{"type": "x"}] and c.sent == []
        assert m.count("r1") == 2  # dead socket pruned
        await m.send_to_user("r1", "ua", {"type": "y"})
        assert a.sent == [{"type": "y"}] and b.sent == [{"type": "x"}]
        m.remove(a)
        m.remove(b)
        assert m.count("r1") == 0
    asyncio.run(run())
