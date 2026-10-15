from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.building import Laptop
from ..models.piscine import LocationState
from ..models.social import Notification
from ..models.user import User
from ..models.xp import UserXp

router = APIRouter(tags=["me"])


@router.get("/me/state")
async def state(run_id: str | None = None, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Rejoin snapshot: seat, piscine clock, locks, laptop, XP/level, unread."""
    xp = (await session.execute(select(UserXp).where(UserXp.user_id == user.id))).scalar_one_or_none()
    laptop = (await session.execute(select(Laptop).where(Laptop.owner_id == user.id))).scalars().first()
    loc = None
    if run_id:
        loc = (await session.execute(
            select(LocationState).where(LocationState.user_id == user.id, LocationState.run_id == run_id)
        )).scalar_one_or_none()
    unread = (await session.execute(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )).scalars().all()
    return {
        "user_id": str(user.id),
        "role": user.role,
        "assigned_seat_tag": user.assigned_seat_tag,
        "status": user.status,
        "xp": xp.total_xp if xp else 0,
        "level": xp.level_number if xp else 1,
        "laptop": {"powered_on": laptop.powered_on, "plugged": laptop.plugged, "battery_minutes": str(laptop.battery_minutes)} if laptop else None,
        "location": {"floor": loc.floor_code, "seat": loc.seat_tag, "lock": loc.lock} if loc else None,
        "unread_count": len(unread),
    }
