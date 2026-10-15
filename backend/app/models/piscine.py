import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base


class PiscineRun(Base):
    __tablename__ = "piscine_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="waiting")
    threshold_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    threshold_count: Mapped[int] = mapped_column(Integer, nullable=False, default=106)
    briefing_floor: Mapped[str | None] = mapped_column(String(16), nullable=True)
    started_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_week: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_phase: Mapped[str] = mapped_column(String(32), nullable=False, default="waiting")


class Enrollment(Base):
    __tablename__ = "piscine_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("piscine_runs.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=False)
    assigned_seat_tag: Mapped[str] = mapped_column(ForeignKey("seats.tag"), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="sequential")
    enrolled_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EventTemplate(Base):
    """Fixed reusable week. Warn 2 min. Q1 10-30, Q2 30-50, Q3 50-65, Raid 65-80,
    Checkpoint 80-90 (+ briefing 0-10 week 1)."""

    __tablename__ = "event_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    week_applies: Mapped[list] = mapped_column(JSONB, nullable=False)
    offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    lock_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    warn_minutes_before: Mapped[int] = mapped_column(Integer, nullable=False, default=2)


class EventInstance(Base):
    __tablename__ = "event_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("piscine_runs.id"), nullable=False)
    template_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("event_templates.id"), nullable=True)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    opens_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
    closes_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
    floor_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="scheduled")


class EventInstanceFloor(Base):
    """Food floor-by-floor status. Event-only tracking."""

    __tablename__ = "event_instance_floors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_instance_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("event_instances.id"), nullable=False)
    floor_code: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")


class LocationState(Base):
    """Current truth per user per run. Illegal moves rejected (403)."""

    __tablename__ = "location_states"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    floor_code: Mapped[str] = mapped_column(String(16), nullable=False)
    seat_tag: Mapped[str | None] = mapped_column(Text, nullable=True)
    beanbag_tag: Mapped[str | None] = mapped_column(Text, nullable=True)
    mentor_seat_tag: Mapped[str | None] = mapped_column(Text, nullable=True)
    lock: Mapped[str] = mapped_column(String(32), nullable=False, default="free")
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MovementLog(Base):
    __tablename__ = "movement_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    from_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
