import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base

ROLES = (
    "candidate",
    "coding_mentor",
    "facility_manager",
    "male_rep",
    "female_rep",
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="candidate")
    display_name: Mapped[str] = mapped_column(String(24), nullable=False)
    skin: Mapped[str] = mapped_column(String(7), nullable=False, default="#b57c54")
    hair: Mapped[str] = mapped_column(String(7), nullable=False, default="#332c30")
    shirt: Mapped[str] = mapped_column(String(7), nullable=False, default="#548e80")
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    wear_id: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assigned_seat_tag: Mapped[str | None] = mapped_column(
        ForeignKey("seats.tag"), unique=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    last_seen_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RolePermission(Base):
    """Checked on every gated call. Extra row `mr_jonathan` = unrestricted."""

    __tablename__ = "role_permissions"

    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    can_call_meeting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    meeting_quota_per_week: Mapped[int | None] = mapped_column(nullable=True)
    can_send_memo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_edit_threshold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_override_laptop: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_eject: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Level(Base):
    """25 fixed prestige bands, top 1190 capped. Read-only at runtime."""

    __tablename__ = "levels"

    level_number: Mapped[int] = mapped_column(primary_key=True)
    min_xp: Mapped[int] = mapped_column(nullable=False)
    max_xp: Mapped[int] = mapped_column(nullable=False)
