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


def require_roles(*roles: str):
    async def checker(user: User = Depends(current_user)) -> User:
        # mr_jonathan is modeled as a coding_mentor with unrestricted flag row;
        # keep the role check simple — quota logic lives in meeting service.
        if user.role not in roles and not (user.role == "coding_mentor" and "mr_jonathan" in roles):
            raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
        return user

    return checker
