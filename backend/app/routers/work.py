from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.building import Laptop
from ..models.user import User
from ..models.work import (
    CheckpointAttempt,
    CheckpointQuestion,
    QuestTask,
    RaidDefense,
    RaidGroup,
    Submission,
)
from ..services.battery import is_dead, tick_minutes
from ..services.grading import passed_bar, score_pct
from ..services.xp import award, partial_xp

router = APIRouter(tags=["work"])


@router.get("/quests/tasks")
async def quest_tasks(
    week: int | None = None,
    quest_number: int | None = None,
    session: AsyncSession = Depends(get_session),
):
    query = select(QuestTask).order_by(QuestTask.week, QuestTask.quest_number, QuestTask.task_number)
    if week is not None:
        query = query.where(QuestTask.week == week)
    if quest_number is not None:
        query = query.where(QuestTask.quest_number == quest_number)
    rows = (await session.execute(query)).scalars().all()
    return [
        {"id": str(t.id), "week": t.week, "quest": t.quest_number, "task": t.task_number,
         "prompt": t.prompt, "xp": t.xp_value}
        for t in rows
    ]


@router.get("/raids/groups")
async def raid_groups(
    run_id: str, week: int | None = None, session: AsyncSession = Depends(get_session)
):
    query = select(RaidGroup).where(RaidGroup.run_id == run_id)
    if week is not None:
        query = query.where(RaidGroup.week == week)
    rows = (await session.execute(query)).scalars().all()
    return [
        {"id": str(g.id), "week": g.week, "members": [str(m) for m in g.member_ids], "status": g.status}
        for g in rows
    ]


class RaidGroupIn(BaseModel):
    run_id: str
    week: int
    project_id: str
    member_ids: list[str]  # 3 ideally; may run with 2


@router.post("/raids/groups")
async def raid_group_create(body: RaidGroupIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if len(body.member_ids) not in (2, 3):
        raise HTTPException(status_code=422, detail="group_must_be_2_or_3")
    group = RaidGroup(run_id=body.run_id, week=body.week, project_id=body.project_id,
                      member_ids=body.member_ids, status="formed")
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return {"id": str(group.id)}


class DefenseOpenIn(BaseModel):
    group_id: str
    question_ids: list[str]  # exactly 2 from the pre-banked set


@router.post("/raids/defenses/open")
async def raid_defense_open(body: DefenseOpenIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    """Exactly 1 mentor opens; 30s total for both Qs, timeout = fail."""
    if user.role != "coding_mentor":
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    if len(body.question_ids) != 2:
        raise HTTPException(status_code=422, detail="need_2_questions")
    now = datetime.now(timezone.utc)
    defense = RaidDefense(group_id=body.group_id, mentor_id=user.id,
                          question_ids=body.question_ids,
                          opened_at=now, deadline_at=now + timedelta(seconds=30))
    session.add(defense)
    await session.commit()
    await session.refresh(defense)
    return {"defense_id": str(defense.id), "deadline": defense.deadline_at.isoformat()}


def _laptop_ok(laptop: Laptop | None):
    if laptop is None:
        raise HTTPException(status_code=404, detail="no_laptop")
    live = tick_minutes(laptop.powered_on, laptop.plugged, float(laptop.battery_minutes), laptop.last_tick_at)
    if is_dead(live):
        raise HTTPException(status_code=409, detail="battery_dead")


class SubmitIn(BaseModel):
    task_id: str
    code: str
    stdin: str = ""
    passed_tests: int = 0
    total_tests: int = 1


@router.post("/quests/submit")
async def quest_submit(body: SubmitIn, run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    laptop = (await session.execute(select(Laptop).where(Laptop.owner_id == user.id))).scalar_one_or_none()
    _laptop_ok(laptop)
    task = (await session.execute(select(QuestTask).where(QuestTask.id == body.task_id))).scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="unknown_task")
    score = score_pct(body.passed_tests, body.total_tests)
    xp = task.xp_value if score == 100 else partial_xp(task.xp_value)
    # Best kept: only the top score per user/task counts; demote any prior best.
    prior_best = (await session.execute(
        select(Submission).where(
            Submission.user_id == user.id, Submission.run_id == run_id,
            Submission.task_id == task.id, Submission.is_best.is_(True),
        )
    )).scalar_one_or_none()
    is_best = prior_best is None or score >= prior_best.score_pct
    if is_best and prior_best is not None:
        prior_best.is_best = False
    sub = Submission(user_id=user.id, run_id=run_id, task_id=task.id, code=body.code, stdin=body.stdin,
                     stdout="", grader_result={"passed": body.passed_tests, "total": body.total_tests},
                     score_pct=score, xp_awarded=xp, is_best=is_best)
    session.add(sub)
    await award(session, user.id, run_id, "quest", xp, ref_id=sub.id)
    await session.commit()
    return {"score": score, "xp": xp, "is_best": is_best}


class RaidAnswerIn(BaseModel):
    defense_id: str
    answer_text: str


@router.post("/raids/defenses/answer")
async def raid_answer(body: RaidAnswerIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    defense = (await session.execute(select(RaidDefense).where(RaidDefense.id == body.defense_id))).scalar_one_or_none()
    if defense is None:
        raise HTTPException(status_code=404, detail="unknown_defense")
    if datetime.now(timezone.utc) > defense.deadline_at:
        defense.verdict = "timeout_fail"
        defense.decided_at = datetime.now(timezone.utc)
        await session.commit()
        raise HTTPException(status_code=409, detail="timeout")
    if defense.answer_text is not None:
        raise HTTPException(status_code=409, detail="already_answered")
    defense.answer_text = body.answer_text  # one shared box, first-submit wins
    await session.commit()
    return {"ok": True}


class VerdictIn(BaseModel):
    defense_id: str
    verdict: str  # pass | fail


@router.post("/raids/defenses/verdict")
async def raid_verdict(body: VerdictIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role != "coding_mentor":
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    defense = (await session.execute(select(RaidDefense).where(RaidDefense.id == body.defense_id))).scalar_one_or_none()
    if defense is None:
        raise HTTPException(status_code=404, detail="unknown_defense")
    defense.verdict = body.verdict
    defense.decided_at = datetime.now(timezone.utc)
    if body.verdict == "pass":
        group = (await session.execute(select(RaidGroup).where(RaidGroup.id == defense.group_id))).scalar_one_or_none()
        for member_id in (group.member_ids if group else []):
            await award(session, member_id, None, "raid", 50, ref_id=defense.id)
    await session.commit()
    return {"verdict": defense.verdict}


@router.get("/checkpoints/unlocked")
async def checkpoints_unlocked(
    run_id: str, week: int, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """Sequential + invisible until prior passes the 100% bar. Fail (30%) never unlocks."""
    questions = (await session.execute(
        select(CheckpointQuestion).where(CheckpointQuestion.week == week).order_by(CheckpointQuestion.q_number)
    )).scalars().all()
    passed = {
        a.question_number
        for a in (await session.execute(
            select(CheckpointAttempt).where(
                CheckpointAttempt.user_id == user.id, CheckpointAttempt.run_id == run_id,
                CheckpointAttempt.score_pct >= 100,
            )
        )).scalars().all()
    }
    visible = [q for q in questions if q.q_number == 1 or (q.q_number - 1) in passed]
    return [{"id": str(q.id), "q": q.q_number, "prompt": q.prompt, "xp": q.xp_value} for q in visible]


class CheckpointIn(BaseModel):
    question_id: str
    code: str
    stdin: str = ""
    passed_tests: int = 0
    total_tests: int = 1
    quit_submitted: bool = False


@router.post("/checkpoints/submit")
async def checkpoint_submit(body: CheckpointIn, run_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    laptop = (await session.execute(select(Laptop).where(Laptop.owner_id == user.id))).scalar_one_or_none()
    _laptop_ok(laptop)
    question = (await session.execute(select(CheckpointQuestion).where(CheckpointQuestion.id == body.question_id))).scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="unknown_question")
    if question.q_number > 1:
        prior = (await session.execute(
            select(CheckpointAttempt).where(
                CheckpointAttempt.user_id == user.id, CheckpointAttempt.run_id == run_id,
                CheckpointAttempt.question_number == question.q_number - 1,
                CheckpointAttempt.score_pct >= question.unlock_bar_pct,
            )
        )).scalars().first()
        if prior is None:
            raise HTTPException(status_code=403, detail={"reason": "locked"})
    score = score_pct(body.passed_tests, body.total_tests)
    unlocked = passed_bar(score, question.unlock_bar_pct)  # default 100%
    xp = question.xp_value if score == 100 else partial_xp(question.xp_value)
    attempt = CheckpointAttempt(user_id=user.id, run_id=run_id, question_id=question.id,
                                question_number=question.q_number, code=body.code, stdin=body.stdin,
                                stdout="", grader_result={"passed": body.passed_tests, "total": body.total_tests},
                                score_pct=score, xp_awarded=xp, quit_submitted=body.quit_submitted)
    session.add(attempt)
    await award(session, user.id, run_id, "checkpoint", xp, ref_id=attempt.id)
    await session.commit()
    return {"score": score, "xp": xp, "unlocked_next": unlocked}
