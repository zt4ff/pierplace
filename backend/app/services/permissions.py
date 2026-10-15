from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import RolePermission, User


async def perms(session: AsyncSession, user: User) -> RolePermission | None:
    # mr_jonathan modeled as unrestricted flag row; mentors look it up by special key
    # when the caller is Jonathan (handled by caller passing is_jonathan=True).
    result = await session.execute(select(RolePermission).where(RolePermission.role == user.role))
    return result.scalar_one_or_none()
