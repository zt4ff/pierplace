"""GET /ws?token=<JWT>&run_id=<id> — read-only presence broadcast relay."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select

from ..core.security import decode_token
from ..db.session import SessionLocal
from ..models.piscine import LocationState
from ..models.user import User
from ..realtime import manager

router = APIRouter(tags=["realtime"])

POLICY_UNAUTHORIZED = 4401


def player_view(loc: LocationState, user: User | None) -> dict:
    return {
        "user": str(loc.user_id),
        "floor": loc.floor_code,
        "seat": loc.seat_tag,
        "beanbag": loc.beanbag_tag,
        "lock": loc.lock,
        "display_name": user.display_name if user else None,
        "character": (
            {"skin": user.skin, "hair": user.hair, "shirt": user.shirt} if user else None
        ),
    }


def user_view(user: User) -> dict:
    return {
        "user": str(user.id),
        "display_name": user.display_name,
        "character": {"skin": user.skin, "hair": user.hair, "shirt": user.shirt},
    }


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
async def presence_ws(websocket: WebSocket, token: str | None = None, run_id: str | None = None):
    try:
        payload = decode_token(token or "")
        user_id = str(payload["sub"])
    except (JWTError, KeyError):
        await websocket.close(code=POLICY_UNAUTHORIZED)
        return
    if not run_id:
        await websocket.close(code=1008)
        return
    user = await load_user(user_id)
    if user is None:
        await websocket.close(code=POLICY_UNAUTHORIZED)
        return

    await websocket.accept()
    await websocket.send_json({"type": "snapshot", "players": await load_snapshot(run_id)})
    await manager.add(run_id, user_id, websocket)
    await manager.broadcast(run_id, {"type": "presence.joined", **user_view(user)}, exclude=websocket)
    try:
        while True:
            msg = await websocket.receive_json()
            # Read-only relay: only ping is honoured; writes go through REST.
            if isinstance(msg, dict) and msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                await websocket.send_json({"type": "error", "reason": "read_only_socket"})
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        await manager.remove(run_id, websocket)
        await manager.broadcast(run_id, {"type": "presence.left", "user": user_id})
