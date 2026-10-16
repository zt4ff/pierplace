"""Presence WebSocket: `GET /ws?token=<JWT>&run_id=<id>` (read-only relay).

Runs on the same ASGI app as the REST API. Per docs/piscine-backend-contract.md
the socket never carries writes: no profile or position updates are accepted
here. Position truth lives in REST `POST /location/move`, which broadcasts
`presence.moved` (and `presence.rejected` to the mover on a locked move) through
``manager`` after commit. On connect the client gets a `snapshot` built from
`location_states` for the run; `presence.joined` / `presence.left` are fanned out
to the rest of the run. The only client frame honoured is `ping` -> `pong`.

Caveat: connections live in this process's memory, so fan-out only reaches
clients connected to the same worker. Multi-worker deploys need a shared bus.
"""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select

from ..core.security import decode_token
from ..db.session import SessionLocal
from ..models.piscine import LocationState
from ..models.user import User

router = APIRouter(tags=["realtime"])

POLICY_UNAUTHORIZED = 4401


class ConnectionManager:
    """In-memory presence registry: one state dict per live socket.

    Each state carries at least ``id`` (user id) and, for authenticated
    sockets, ``run_id`` so broadcasts can be scoped to one run.
    """

    def __init__(self) -> None:
        self.connections: dict[WebSocket, dict] = {}

    def add(self, websocket: WebSocket, state: dict) -> None:
        self.connections[websocket] = state

    def remove(self, websocket: WebSocket) -> dict | None:
        return self.connections.pop(websocket, None)

    def count(self, run_id: str | None = None) -> int:
        return sum(1 for s in self.connections.values() if run_id is None or s.get("run_id") == run_id)

    def snapshot(self) -> list[dict]:
        return [dict(state) for state in self.connections.values()]

    def seated_elsewhere(self, player_id: str, table_id: str) -> bool:
        """True only when we know this player is seated at a *different* table.

        The socket is read-only, so seat state is only known if something
        server-side recorded it; unknown players are never blocked.
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

    async def _send(self, websocket: WebSocket, payload: str) -> None:
        try:
            await websocket.send_text(payload)
        except Exception:  # noqa: BLE001 - a dead socket must not stop the fan-out
            self.connections.pop(websocket, None)

    async def broadcast(
        self, message: dict, skip: WebSocket | None = None, run_id: str | None = None
    ) -> None:
        payload = json.dumps(message, default=str)
        for websocket, state in list(self.connections.items()):
            if websocket is skip:
                continue
            if run_id is not None and state.get("run_id") != run_id:
                continue
            await self._send(websocket, payload)

    async def send_to_user(self, run_id: str, user_id: str, message: dict) -> None:
        payload = json.dumps(message, default=str)
        for websocket, state in list(self.connections.items()):
            if state.get("run_id") == run_id and state.get("id") == user_id:
                await self._send(websocket, payload)


manager = ConnectionManager()


def _profile(user: User | None) -> dict | None:
    if user is None:
        return None
    return {"name": user.display_name, "skin": user.skin, "hair": user.hair, "shirt": user.shirt}


def player_view(loc: LocationState, user: User | None) -> dict:
    uid = str(loc.user_id)
    return {
        "id": uid,
        "user": uid,
        "floor": loc.floor_code,
        "seat": loc.seat_tag,
        "beanbag": loc.beanbag_tag,
        "lock": loc.lock,
        "profile": _profile(user),
    }


def user_view(user: User) -> dict:
    uid = str(user.id)
    return {"id": uid, "user": uid, "profile": _profile(user)}


async def load_user(user_id: str) -> User | None:
    async with SessionLocal() as session:
        return (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def load_snapshot(run_id: str) -> list[dict]:
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(LocationState, User)
                .join(User, User.id == LocationState.user_id)
                .where(LocationState.run_id == run_id)
            )
        ).all()
        return [player_view(loc, user) for loc, user in rows]


@router.websocket("/ws")
async def presence_socket(
    websocket: WebSocket, token: str | None = None, run_id: str | None = None
) -> None:
    try:
        user_id = str(decode_token(token or "")["sub"])
    except (JWTError, KeyError):
        await websocket.close(code=POLICY_UNAUTHORIZED)
        return
    if not run_id:
        await websocket.close(code=1008)
        return
    try:
        user = await load_user(user_id)
    except Exception:  # noqa: BLE001 - bad id format / database unavailable
        user = None
    if user is None:
        await websocket.close(code=POLICY_UNAUTHORIZED)
        return

    await websocket.accept()
    await websocket.send_text(
        json.dumps(
            {"type": "snapshot", "id": user_id, "players": await load_snapshot(run_id)},
            default=str,
        )
    )
    manager.add(websocket, {"id": user_id, "run_id": run_id})
    await manager.broadcast({"type": "presence.joined", **user_view(user)}, skip=websocket, run_id=run_id)

    try:
        async for raw in websocket.iter_text():
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                message = None
            # Read-only relay: only ping is honoured; writes go through REST.
            if isinstance(message, dict) and message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            else:
                await websocket.send_text(json.dumps({"type": "error", "reason": "read_only_socket"}))
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(websocket)
        await manager.broadcast({"type": "presence.left", "id": user_id, "user": user_id}, run_id=run_id)
