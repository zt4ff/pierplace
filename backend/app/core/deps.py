from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..models.user import User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(status_code=401, detail="unauthenticated")
    try:
        payload = decode_token(creds.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="unauthenticated")
    user = (await session.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="unauthenticated")
    return user


async def get_user_by_token(session: AsyncSession, token: str) -> User | None:
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user = (await session.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
    return user


def require_roles(*roles: str):
    async def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles and not (user.role == "coding_mentor" and "mr_jonathan" in roles):
            raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
        return user

    return checker
