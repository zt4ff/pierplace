import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base


class Floor(Base):
    __tablename__ = "floors"

    code: Mapped[str] = mapped_column(String(16), primary_key=True)  # f1, f2
    label: Mapped[str] = mapped_column(String(64), nullable=False)


class GameTable(Base):
    """Tags stable forever: t1-t18 assignable, t19+ relax. Never renumbered."""

    __tablename__ = "game_tables"

    tag: Mapped[str] = mapped_column(Text, primary_key=True)
    floor_code: Mapped[str] = mapped_column(ForeignKey("floors.code"), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    seats_count: Mapped[int] = mapped_column(Integer, nullable=False)
    is_assignable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Seat(Base):
    """PK is the painted tag (t1s3). One live occupant max; held whole run."""

    __tablename__ = "seats"

    tag: Mapped[str] = mapped_column(Text, primary_key=True)
    table_tag: Mapped[str] = mapped_column(ForeignKey("game_tables.tag"), nullable=False)
    seat_index: Mapped[int] = mapped_column(Integer, nullable=False)
    floor_code: Mapped[str] = mapped_column(String(16), nullable=False)
    is_assignable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assigned_owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)
    occupant_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)
    has_outlet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Beanbag(Base):
    __tablename__ = "beanbags"

    tag: Mapped[str] = mapped_column(Text, primary_key=True)  # b1-b8
    floor_code: Mapped[str] = mapped_column(String(16), nullable=False)
    occupant_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)


class MentorSeat(Base):
    __tablename__ = "mentor_seats"

    tag: Mapped[str] = mapped_column(Text, primary_key=True)  # m1...
    floor_code: Mapped[str] = mapped_column(String(16), nullable=False)
    occupant_mentor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    always_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Laptop(Base):
    """Exactly one of seat_tag / mentor_seat_tag. Dead (=0) blocks Python."""

    __tablename__ = "laptops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seat_tag: Mapped[str | None] = mapped_column(ForeignKey("seats.tag"), unique=True, nullable=True)
    mentor_seat_tag: Mapped[str | None] = mapped_column(ForeignKey("mentor_seats.tag"), unique=True, nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    powered_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    plugged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    battery_minutes: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=30)
    last_tick_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PowerEvent(Base):
    __tablename__ = "power_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    laptop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("laptops.id"), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    battery_before: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    battery_after: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
