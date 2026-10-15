from sqlalchemy import Integer, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from ..models.building import Seat


def threshold_count(total_assignable: int, pct: int) -> int:
    """Derive start threshold from tunable pct (default 50% of 212)."""
    return round(total_assignable * pct / 100)


async def first_free_assignable(session: AsyncSession) -> Seat | None:
    """Sequential first-free assignment (t1s1, t1s2, ... t2s1, ...).

    Tags stable, never renumbered. Numeric table order — plain string sort
    would hand out t10 before t2.
    """
    table_num = func.substring(Seat.table_tag, 2).cast(Integer)
    result = await session.execute(
        select(Seat)
        .where(Seat.is_assignable.is_(True), Seat.assigned_owner_id.is_(None))
        .order_by(table_num, Seat.seat_index)
    )
    return result.scalars().first()
