from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.building import Seat
from ..models.piscine import LocationState, MovementLog
from ..models.user import User

router = APIRouter(prefix="/seats", tags=["seats"])


class SitIn(BaseModel):
    seat_tag: str | None = None
    beanbag_tag: str | None = None
    mentor_seat_tag: str | None = None
    run_id: str


def _locked(lock: str) -> bool:
    return lock in ("seat-locked", "zone-locked", "assembly-locked")


@router.post("/sit")
async def sit(body: SitIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    loc = (await session.execute(
        select(LocationState).where(LocationState.user_id == user.id, LocationState.run_id == body.run_id)
    )).scalar_one_or_none()
    if loc is not None and _locked(loc.lock):
        raise HTTPException(status_code=403, detail={"reason": "locked"})
    if body.seat_tag:
        seat = (await session.execute(select(Seat).where(Seat.tag == body.seat_tag))).scalar_one_or_none()
        if seat is None:
            raise HTTPException(status_code=404, detail="unknown_tag")
        if seat.occupant_user_id not in (None, user.id) and seat.assigned_owner_id != user.id:
            # owner-wins: only owner or mentor-eject path may take an occupied seat
            raise HTTPException(status_code=409, detail="occupied")
        seat.occupant_user_id = user.id
        loc = (await session.execute(
            select(LocationState).where(LocationState.user_id == user.id, LocationState.run_id == body.run_id)
        )).scalar_one_or_none()
        if loc is not None:
            loc.seat_tag = seat.tag
            loc.floor_code = seat.floor_code
    session.add(MovementLog(run_id=body.run_id, actor_id=user.id, to_ref=body.seat_tag or body.beanbag_tag, result="ok"))
    await session.commit()
    return {"ok": True}


@router.post("/stand")
async def stand(run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Seat).where(Seat.occupant_user_id == user.id))
    for seat in result.scalars().all():
        seat.occupant_user_id = None
    session.add(MovementLog(run_id=run_id, actor_id=user.id, to_ref="aisle", result="ok"))
    await session.commit()
    return {"ok": True}


class EjectIn(BaseModel):
    seat_tag: str
    target_user_id: str
    run_id: str


@router.post("/eject")
async def eject(body: EjectIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    seat = (await session.execute(select(Seat).where(Seat.tag == body.seat_tag))).scalar_one_or_none()
    if seat is None:
        raise HTTPException(status_code=404, detail="unknown_tag")
    is_owner = seat.assigned_owner_id == user.id
    is_staff = user.role in ("coding_mentor", "facility_manager", "male_rep", "female_rep")
    if not (is_owner or is_staff):
        raise HTTPException(status_code=403, detail={"reason": "not_owner"})
    seat.occupant_user_id = None
    session.add(MovementLog(run_id=body.run_id, actor_id=user.id, to_ref=f"eject:{body.target_user_id}", result="ejected"))
    await session.commit()
    return {"ok": True}
