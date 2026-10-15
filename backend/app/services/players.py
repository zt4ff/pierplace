"""Lobby player persistence: WS joins turn character profiles into `users` rows."""

from datetime import datetime, timezone
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User

# Guests join the lobby from the grayscale landing flow without passwords. This
# sentinel hash can never match a real bcrypt verify, so the row cannot log in.
GUEST_PASSWORD = "!lobby-guest"
USERNAME_MAX = 32
DISPLAY_MAX = 24
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return slug[:USERNAME_MAX] or "guest"


def _color(value: object, default: str) -> str:
    return value if isinstance(value, str) and HEX_COLOR.match(value) else default


async def upsert_player(session: AsyncSession, profile: dict | None) -> User:
    """Create or update the `users` row for a lobby character.

    Identity is the character name (stable username slug), so reconnecting keeps
    the same row — and therefore the same chat identity — across sessions.
    """
    profile = profile or {}
    display_name = str(profile.get("name") or "").strip()[:DISPLAY_MAX] or "Guest"
    username = slugify(display_name)

    user = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if user is None:
        user = User(
            username=username,
            password_hash=GUEST_PASSWORD,
            role="candidate",
            display_name=display_name,
        )
        session.add(user)

    user.display_name = display_name
    user.skin = _color(profile.get("skin"), user.skin or "#b57c54")
    user.hair = _color(profile.get("hair"), user.hair or "#332c30")
    user.shirt = _color(profile.get("shirt"), user.shirt or "#548e80")
    user.status = "active"
    user.last_seen_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(user)
    return user
