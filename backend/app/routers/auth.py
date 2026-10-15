from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..core.security import create_token, hash_password, verify_password
from ..db.session import get_session
from ..models.user import ROLES, User
from ..schemas.auth import AuthOut, LoginIn, RegisterIn

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthOut)
async def register(body: RegisterIn, session: AsyncSession = Depends(get_session)):
    existing = (await session.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="username_taken")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role="candidate",
        display_name=body.display_name.strip()[:24],
        skin=body.skin,
        hair=body.hair,
        shirt=body.shirt,
        photo_url=body.photo_url,
        wear_id=body.wear_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return AuthOut(token=create_token(str(user.id), user.role), user_id=str(user.id), role=user.role)


@router.post("/login", response_model=AuthOut)
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)):
    user = (await session.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    return AuthOut(token=create_token(str(user.id), user.role), user_id=str(user.id), role=user.role)


@router.get("/me")
async def me(user: User = Depends(current_user)):
    assert "candidate" in ROLES  # keep palette/role source referenced
    return {
        "user_id": str(user.id),
        "username": user.username,
        "role": user.role,
        "display_name": user.display_name,
        "character": {"skin": user.skin, "hair": user.hair, "shirt": user.shirt},
        "photo_url": user.photo_url,
        "wear_id": user.wear_id,
        "assigned_seat_tag": user.assigned_seat_tag,
        "status": user.status,
    }
