from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import Level
from ..models.xp import UserXp, XpAward

PARTIAL_PCT = 30  # failed quest/checkpoint effort floor; failed raid = 0


def partial_xp(full: int) -> int:
    return round(full * PARTIAL_PCT / 100)


async def award(session: AsyncSession, user_id, run_id, source: str, xp: int, ref_id=None) -> XpAward:
    row = XpAward(user_id=user_id, run_id=run_id, source=source, xp=xp, ref_id=ref_id)
    session.add(row)
    await session.flush()
    total = await session.execute(select(UserXp).where(UserXp.user_id == user_id))
    current = total.scalar_one_or_none()
    new_total = (current.total_xp if current else 0) + xp
    level = (
        await session.execute(
            select(Level).where(Level.min_xp <= new_total, Level.max_xp >= new_total)
        )
    ).scalar_one_or_none()
    if level is None:  # above top band caps at 25
        level = (await session.execute(select(Level).order_by(Level.level_number.desc()))).scalars().first()
    if current is None:
        session.add(UserXp(user_id=user_id, total_xp=new_total, level_number=level.level_number))
    else:
        current.total_xp = new_total
        current.level_number = level.level_number
    return row
