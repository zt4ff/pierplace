from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.building import Laptop, PowerEvent
from ..models.user import User
from ..services.battery import is_dead, tick_minutes

router = APIRouter(prefix="/laptops", tags=["laptops"])


class OpenIn(BaseModel):
    seat_tag: str | None = None


@router.get("/me")
async def my_laptop(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Laptop HUD truth: power/plug/battery with wall-clock tick applied."""
    laptop = (await session.execute(select(Laptop).where(Laptop.owner_id == user.id))).scalar_one_or_none()
    if laptop is None:
        raise HTTPException(status_code=404, detail="no_laptop")
    live = tick_minutes(laptop.powered_on, laptop.plugged, float(laptop.battery_minutes), laptop.last_tick_at)
    return {
        "laptop_id": str(laptop.id),
        "seat_tag": laptop.seat_tag,
        "powered_on": laptop.powered_on,
        "plugged": laptop.plugged,
        "battery_minutes": live,
        "dead": is_dead(live),
    }


@router.post("/open")
async def open_laptop(body: OpenIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    laptop = (await session.execute(select(Laptop).where(Laptop.owner_id == user.id))).scalar_one_or_none()
    if laptop is None:
        raise HTTPException(status_code=404, detail="no_laptop")
    if body.seat_tag and laptop.seat_tag != body.seat_tag:
        # non-owner access rejected; mentors use override path below
        if user.role not in ("coding_mentor", "facility_manager"):
            raise HTTPException(status_code=403, detail={"reason": "not_owner"})
    live = tick_minutes(laptop.powered_on, laptop.plugged, float(laptop.battery_minutes), laptop.last_tick_at)
    if is_dead(live):
        raise HTTPException(status_code=409, detail="battery_dead")
    return {"ok": True, "battery_minutes": live}


class PowerIn(BaseModel):
    laptop_id: str
    action: str  # power_on | power_off | plug | unplug


@router.post("/power")
async def power(body: PowerIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    laptop = (await session.execute(select(Laptop).where(Laptop.id == body.laptop_id))).scalar_one_or_none()
    if laptop is None or (laptop.owner_id != user.id and user.role not in ("coding_mentor", "facility_manager")):
        raise HTTPException(status_code=403, detail={"reason": "not_owner"})
    before = float(laptop.battery_minutes)
    if body.action == "power_on":
        laptop.powered_on = True
    elif body.action == "power_off":
        laptop.powered_on = False
    elif body.action == "plug":
        laptop.plugged = True
        laptop.battery_minutes = 30
    elif body.action == "unplug":
        laptop.plugged = False
    session.add(PowerEvent(laptop_id=laptop.id, actor_id=user.id, action=body.action, battery_before=before, battery_after=float(laptop.battery_minutes)))
    await session.commit()
    return {"ok": True}
