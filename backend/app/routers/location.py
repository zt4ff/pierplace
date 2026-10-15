from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.piscine import LocationState, MovementLog
from ..models.user import User

router = APIRouter(prefix="/location", tags=["location"])

LOCKED = ("seat-locked", "zone-locked", "assembly-locked", "offline")


class MoveIn(BaseModel):
    run_id: str
    floor_code: str  # f1 | f2 | waiting_area
    seat_tag: str | None = None
    beanbag_tag: str | None = None


@router.post("/move")
async def move(body: MoveIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Low-frequency REST position update. Illegal moves -> 403 locked."""
    loc = (
        await session.execute(
            select(LocationState).where(
                LocationState.user_id == user.id, LocationState.run_id == body.run_id
            )
        )
    ).scalar_one_or_none()
    if loc is not None and loc.lock in LOCKED:
        session.add(
            MovementLog(
                run_id=body.run_id,
                actor_id=user.id,
                from_ref=loc.seat_tag or loc.beanbag_tag,
                to_ref=body.seat_tag or body.beanbag_tag or body.floor_code,
                result="rejected_locked",
            )
        )
        await session.commit()
        raise HTTPException(status_code=403, detail={"reason": "locked"})
    if loc is None:
        loc = LocationState(
            user_id=user.id, run_id=body.run_id, floor_code=body.floor_code, lock="free"
        )
        session.add(loc)
    from_ref = loc.seat_tag or loc.beanbag_tag or loc.floor_code
    loc.floor_code = body.floor_code
    loc.seat_tag = body.seat_tag
    loc.beanbag_tag = body.beanbag_tag
    loc.mentor_seat_tag = None
    session.add(
        MovementLog(
            run_id=body.run_id,
            actor_id=user.id,
            from_ref=from_ref,
            to_ref=body.seat_tag or body.beanbag_tag or body.floor_code,
            result="ok",
        )
    )
    await session.commit()
    return {"ok": True, "floor": loc.floor_code, "lock": loc.lock}


@router.get("/me")
async def my_location(
    run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    loc = (
        await session.execute(
            select(LocationState).where(
                LocationState.user_id == user.id, LocationState.run_id == run_id
            )
        )
    ).scalar_one_or_none()
    if loc is None:
        raise HTTPException(status_code=404, detail="unknown_run")
    return {
        "floor": loc.floor_code,
        "seat": loc.seat_tag,
        "beanbag": loc.beanbag_tag,
        "lock": loc.lock,
    }


@router.get("/roster")
async def roster(
    run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    rows = (
        await session.execute(select(LocationState).where(LocationState.run_id == run_id))
    ).scalars().all()
    return [
        {
            "user": str(r.user_id),
            "floor": r.floor_code,
            "seat": r.seat_tag,
            "lock": r.lock,
        }
        for r in rows
    ]
