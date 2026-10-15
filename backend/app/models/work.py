import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db.base import Base


class QuestTask(Base):
    __tablename__ = "quest_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    quest_number: Mapped[int] = mapped_column(Integer, nullable=False)
    task_number: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    tests: Mapped[dict] = mapped_column(JSONB, nullable=False)
    xp_value: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Submission(Base):
    """Every explicit Submit. Casual Runs don't count. Best kept per user/task."""

    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quest_tasks.id"), nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    stdin: Mapped[str] = mapped_column(Text, nullable=False, default="")
    stdout: Mapped[str] = mapped_column(Text, nullable=False, default="")
    grader_result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    score_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    is_best: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RaidProject(Base):
    __tablename__ = "raid_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    brief: Mapped[str] = mapped_column(Text, nullable=False)
    question_bank: Mapped[list] = mapped_column(JSONB, nullable=False)
    xp_shared: Mapped[int] = mapped_column(Integer, nullable=False, default=50)


class RaidGroup(Base):
    __tablename__ = "raid_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("raid_projects.id"), nullable=False)
    member_ids: Mapped[list] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="formed")


class RaidDefense(Base):
    """One group + exactly 1 mentor. 30s total both Qs. Timeout = fail."""

    __tablename__ = "raid_defenses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    mentor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    question_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    opened_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deadline_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(32), nullable=True)
    decided_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CheckpointQuestion(Base):
    __tablename__ = "checkpoint_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    q_number: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    tests: Mapped[dict] = mapped_column(JSONB, nullable=False)
    xp_value: Mapped[int] = mapped_column(Integer, nullable=False)
    unlock_bar_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    difficulty_rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CheckpointAttempt(Base):
    __tablename__ = "checkpoint_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("checkpoint_questions.id"), nullable=False)
    question_number: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    stdin: Mapped[str] = mapped_column(Text, nullable=False, default="")
    stdout: Mapped[str] = mapped_column(Text, nullable=False, default="")
    grader_result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    score_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    unlocked_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quit_submitted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
