import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base


class XpAward(Base):
    """Append-only ledger. Behavior + task XP. Memo-read default 2."""

    __tablename__ = "xp_awards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    xp: Mapped[int] = mapped_column(Integer, nullable=False)
    at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserXp(Base):
    """Materialized total. Board groups by level."""

    __tablename__ = "user_xp"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    total_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level_number: Mapped[int] = mapped_column(ForeignKey("levels.level_number"), nullable=False, default=1)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WaterDrink(Base):
    __tablename__ = "water_drinks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    counted: Mapped[bool] = mapped_column(nullable=False, default=False)
    at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Setting(Base):
    """Tunable without code. Copied into run rows at creation."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
