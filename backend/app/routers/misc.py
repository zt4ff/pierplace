from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.social import MentorTrigger
from ..models.user import User
from ..models.work import CheckpointAttempt, Submission
from ..models.xp import UserXp, WaterDrink
from ..services.xp import award

router = APIRouter(tags=["misc"])


@router.get("/xp/board")
async def board(level: int | None = None, session: AsyncSession = Depends(get_session)):
    query = select(UserXp).order_by(UserXp.total_xp.desc()).limit(200)
    if level is not None:
        query = select(UserXp).where(UserXp.level_number == level).order_by(UserXp.total_xp.desc()).limit(200)
    rows = (await session.execute(query)).scalars().all()
    return [{"user": str(r.user_id), "xp": r.total_xp, "level": r.level_number} for r in rows]


@router.post("/behavior/water")
async def water(run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    # 1 counted drink/hour max -> 5 XP (locked rule)
    rows = (await session.execute(select(WaterDrink).where(WaterDrink.user_id == user.id, WaterDrink.run_id == run_id).order_by(WaterDrink.at.desc()))).scalars().all()
    now = datetime.now(timezone.utc)
    counted = not rows or (now - rows[0].at).total_seconds() >= 3600
    session.add(WaterDrink(user_id=user.id, run_id=run_id, counted=counted))
    if counted:
        await award(session, user.id, run_id, "water", 5)
    await session.commit()
    return {"counted": counted}


@router.get("/mentors/triggers")
async def triggers(run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role not in ("coding_mentor", "facility_manager"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    rows = (await session.execute(select(MentorTrigger).where(MentorTrigger.run_id == run_id).order_by(MentorTrigger.created_at.desc()).limit(100))).scalars().all()
    return [{"user": str(r.user_id), "kind": r.kind, "at": r.created_at.isoformat()} for r in rows]


@router.get("/xp/me")
async def my_xp(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    row = (await session.execute(select(UserXp).where(UserXp.user_id == user.id))).scalar_one_or_none()
    return {"xp": row.total_xp if row else 0, "level": row.level_number if row else 1}


class AttendIn(BaseModel):
    run_id: str
    kind: str  # briefing | assembly


@router.post("/behavior/attend")
async def attend(body: AttendIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Briefing 20 XP, assembly 10 XP. Called once per event by the tick path."""
    xp = 20 if body.kind == "briefing" else 10
    await award(session, user.id, body.run_id, body.kind, xp)
    await session.commit()
    return {"ok": True, "xp": xp}


class ChatXpIn(BaseModel):
    run_id: str
    kind: str  # table | mentor


@router.post("/behavior/chat-participation")
async def chat_participation(body: ChatXpIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Table-chat / mentor-chat 5 XP each (capped 4/week by the caller)."""
    await award(session, user.id, body.run_id, f"{body.kind}_chat", 5)
    await session.commit()
    return {"ok": True, "xp": 5}


@router.get("/mentors/activity")
async def mentor_activity(
    run_id: str, student_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Per-attempt full code+stdin+stdout+grader+XP view for mentors."""
    if user.role not in ("coding_mentor", "facility_manager"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    subs = (await session.execute(
        select(Submission).where(Submission.user_id == student_id, Submission.run_id == run_id).order_by(Submission.at)
    )).scalars().all()
    attempts = (await session.execute(
        select(CheckpointAttempt).where(CheckpointAttempt.user_id == student_id, CheckpointAttempt.run_id == run_id).order_by(CheckpointAttempt.at)
    )).scalars().all()
    return {
        "submissions": [
            {"code": s.code, "stdin": s.stdin, "stdout": s.stdout,
             "grader": s.grader_result, "score": s.score_pct, "xp": s.xp_awarded,
             "at": s.at.isoformat()}
            for s in subs
        ],
        "checkpoint_attempts": [
            {"q": a.question_number, "code": a.code, "stdin": a.stdin, "stdout": a.stdout,
             "grader": a.grader_result, "score": a.score_pct, "xp": a.xp_awarded,
             "at": a.at.isoformat()}
            for a in attempts
        ],
    }


@router.get("/mentors/id-card")
async def mentor_id_card(
    student_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Mentors see ALL student details (character + photo + seat)."""
    if user.role not in ("coding_mentor", "facility_manager"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    student = (await session.execute(select(User).where(User.id == student_id))).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="unknown_user")
    return {
        "user_id": str(student.id),
        "username": student.username,
        "role": student.role,
        "display_name": student.display_name,
        "character": {"skin": student.skin, "hair": student.hair, "shirt": student.shirt},
        "photo_url": student.photo_url,
        "wear_id": student.wear_id,
        "assigned_seat_tag": student.assigned_seat_tag,
        "status": student.status,
    }


class TriggerHandleIn(BaseModel):
    trigger_id: str


@router.post("/mentors/triggers/handle")
async def trigger_handle(body: TriggerHandleIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role not in ("coding_mentor", "facility_manager"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    trigger = (await session.execute(select(MentorTrigger).where(MentorTrigger.id == body.trigger_id))).scalar_one_or_none()
    if trigger is None:
        raise HTTPException(status_code=404, detail="unknown_trigger")
    trigger.handled_by = user.id
    trigger.handled_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}
