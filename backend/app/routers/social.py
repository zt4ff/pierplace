from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.social import ChatMembership, Meeting, Memo, Message, Notification
from ..models.user import User
from ..services.xp import award

router = APIRouter(tags=["social"])


class MessageIn(BaseModel):
    chat_id: str
    text: str


@router.post("/chats/messages")
async def send_message(body: MessageIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if not body.text.strip() or len(body.text) > 2000:
        raise HTTPException(status_code=422, detail="bad_text")
    membership = (await session.execute(
        select(ChatMembership).where(ChatMembership.chat_id == body.chat_id, ChatMembership.user_id == user.id, ChatMembership.left_at.is_(None))
    )).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=403, detail={"reason": "not_seated_here"})
    msg = Message(chat_id=body.chat_id, sender_id=user.id, text=body.text.strip())
    session.add(msg)
    await session.commit()
    return {"ok": True}


@router.get("/chats/messages")
async def list_messages(chat_id: str, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    membership = (await session.execute(
        select(ChatMembership).where(ChatMembership.chat_id == chat_id, ChatMembership.user_id == user.id)
    )).scalars().first()
    query = select(Message).where(Message.chat_id == chat_id).order_by(Message.sent_at)
    if membership is not None:
        # forward-only for squatters/mentors: no back-history before join
        query = query.where(Message.sent_at >= membership.joined_at)
    rows = (await session.execute(query)).scalars().all()
    return [{"text": m.text, "sender": str(m.sender_id), "at": m.sent_at.isoformat()} for m in rows]


class MemoIn(BaseModel):
    run_id: str
    target: str  # all | floor:X | table:Y
    body: str


@router.post("/memos/send")
async def send_memo(body: MemoIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role not in ("coding_mentor", "male_rep", "female_rep"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    memo = Memo(sender_id=user.id, run_id=body.run_id, target=body.target, body=body.body)
    session.add(memo)
    await session.commit()
    return {"ok": True}


class MeetingIn(BaseModel):
    run_id: str
    floor_code: str


@router.post("/meetings/call")
async def call_meeting(body: MeetingIn, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if user.role not in ("coding_mentor", "male_rep", "female_rep"):
        raise HTTPException(status_code=403, detail={"reason": "wrong_role"})
    # quota: reps 1/week each, Jonathan unlimited, other mentors none (enforced here minimally)
    meeting = Meeting(caller_id=user.id, run_id=body.run_id, floor_code=body.floor_code, quota_consumed=True)
    session.add(meeting)
    await session.commit()
    return {"ok": True}


@router.get("/notify/inbox")
async def inbox(
    run_id: str | None = None, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)
):
    """One phone feed. Rejoin replays undelivered/unread first."""
    query = select(Notification).where(Notification.user_id == user.id).order_by(Notification.delivered_at.desc())
    if run_id is not None:
        query = query.where(Notification.run_id == run_id)
    rows = (await session.execute(query)).scalars().all()
    rows.sort(key=lambda n: n.read_at is not None)
    return [
        {"id": str(n.id), "kind": n.kind, "title": n.title, "body": n.body,
         "target": n.target, "read": n.read_at is not None,
         "at": n.delivered_at.isoformat() if n.delivered_at else None}
        for n in rows
    ]


@router.post("/notify/read")
async def mark_read(notification_ids: list[str], user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    for nid in notification_ids:
        note = (await session.execute(
            select(Notification).where(Notification.id == nid, Notification.user_id == user.id)
        )).scalar_one_or_none()
        if note is not None and note.read_at is None:
            from datetime import datetime, timezone
            note.read_at = datetime.now(timezone.utc)
            if note.kind == "memo":
                await award(session, user.id, note.run_id, "memo_read", 2, ref_id=note.id)
    await session.commit()
    return {"ok": True}
