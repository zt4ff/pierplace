from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.building import Laptop, Seat
from ..models.piscine import (
    Enrollment,
    EventInstance,
    EventInstanceFloor,
    LocationState,
    PiscineRun,
)
from ..models.social import Notification
from ..models.user import User
from ..services.seating import first_free_assignable, threshold_count

router = APIRouter(prefix="/piscine", tags=["piscine"])


@router.post("/runs")
async def create_run(threshold_pct: int = 50, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role not in ("coding_mentor", "facility_manager"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    total = (await session.execute(select(func.count()).select_from(Seat).where(Seat.is_assignable.is_(True)))).scalar() or 212
    run = PiscineRun(threshold_pct=threshold_pct, threshold_count=threshold_count(total, threshold_pct))
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return {"run_id": str(run.id), "threshold_count": run.threshold_count}


class EnrollIn(BaseModel):
    run_id: str


@router.post("/runs/enroll")
async def enroll(body: EnrollIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    seat = await first_free_assignable(session)
    if seat is None:
        raise HTTPException(status_code=409, detail="run_full")
    seat.assigned_owner_id = user.id
    seat.occupant_user_id = user.id
    user.assigned_seat_tag = seat.tag
    enrollment = Enrollment(run_id=body.run_id, user_id=user.id, assigned_seat_tag=seat.tag)
    session.add(enrollment)
    session.add(LocationState(user_id=user.id, run_id=body.run_id, floor_code=seat.floor_code, seat_tag=seat.tag, lock="free"))
    session.add(Laptop(seat_tag=seat.tag, owner_id=user.id, powered_on=False, plugged=False, battery_minutes=30))
    session.add(Notification(user_id=user.id, run_id=body.run_id, kind="congrats_with_seat",
                             title="Welcome to the piscine", body=f"Your seat is {seat.tag}. Find it by its tag.",
                             target="user"))
    await session.commit()
    return {"seat_tag": seat.tag}


@router.post("/runs/{run_id}/start")
async def start(run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role not in ("coding_mentor", "facility_manager"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    run = (await session.execute(select(PiscineRun).where(PiscineRun.id == run_id))).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="unknown_run")
    enrolled = (await session.execute(select(func.count()).select_from(Enrollment).where(Enrollment.run_id == run_id))).scalar() or 0
    if enrolled < run.threshold_count:
        raise HTTPException(status_code=409, detail="threshold_not_met")
    now = datetime.now(timezone.utc)
    run.status = "briefing"
    run.started_at = now
    run.ends_at = now + timedelta(hours=6)
    await session.commit()
    return {"started": True, "ends_at": run.ends_at.isoformat()}


@router.get("/events")
async def events(run_id: str, session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(EventInstance).where(EventInstance.run_id == run_id).order_by(EventInstance.opens_at))).scalars().all()
    return [{"kind": r.kind, "week": r.week_number, "opens": r.opens_at.isoformat(), "closes": r.closes_at.isoformat(), "status": r.status} for r in rows]


class ThresholdIn(BaseModel):
    threshold_pct: int


@router.patch("/runs/{run_id}/threshold")
async def set_threshold(run_id: str, body: ThresholdIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Mentor-tunable start threshold (stored setting, never rewrites history)."""
    if user.role != "coding_mentor":
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    run = (await session.execute(select(PiscineRun).where(PiscineRun.id == run_id))).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="unknown_run")
    total = (await session.execute(select(func.count()).select_from(Seat).where(Seat.is_assignable.is_(True)))).scalar() or 212
    run.threshold_pct = body.threshold_pct
    run.threshold_count = threshold_count(total, body.threshold_pct)
    await session.commit()
    return {"threshold_pct": run.threshold_pct, "threshold_count": run.threshold_count}


class BriefingFloorIn(BaseModel):
    floor_code: str  # f1 | f2


@router.post("/runs/{run_id}/briefing-floor")
async def set_briefing_floor(run_id: str, body: BriefingFloorIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Jonathan picks the week-1 briefing floor; attendance enforced there."""
    if user.role != "coding_mentor":
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    run = (await session.execute(select(PiscineRun).where(PiscineRun.id == run_id))).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="unknown_run")
    run.briefing_floor = body.floor_code
    await session.commit()
    return {"briefing_floor": run.briefing_floor}


@router.get("/food-floor-status")
async def food_floor_status(event_instance_id: str, session: AsyncSession = Depends(get_session)):
    """Concurrent floor-by-floor food tracking: pending | on_floor | done."""
    rows = (await session.execute(
        select(EventInstanceFloor).where(EventInstanceFloor.event_instance_id == event_instance_id)
    )).scalars().all()
    return [{"floor": r.floor_code, "status": r.status} for r in rows]
