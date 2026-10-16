"""Lobby table chat persistence, built on the existing `chats`/`messages` tables.

The piscine contract scopes chat to a physical table and a run. The lobby has no
piscine run yet, so we keep one long-lived `lobby` run and one chat row per table
tag. A table tag here is the frontend scoped id (e.g. `floor-1-west-1`), which is
exactly the id the WS presence layer tracks for seating.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.piscine import PiscineRun
from ..models.social import Chat, Message
from ..models.user import User

LOBBY_STATUS = "lobby"
MAX_MESSAGES = 200


async def get_or_create_lobby_run(session: AsyncSession) -> PiscineRun:
    run = (
        await session.execute(select(PiscineRun).where(PiscineRun.status == LOBBY_STATUS))
    ).scalars().first()
    if run is None:
        run = PiscineRun(status=LOBBY_STATUS, current_phase="lobby")
        session.add(run)
        await session.commit()
        await session.refresh(run)
    return run


async def get_or_create_table_chat(session: AsyncSession, table_tag: str) -> Chat:
    chat = (
        await session.execute(
            select(Chat).where(Chat.kind == "table", Chat.table_tag == table_tag)
        )
    ).scalars().first()
    if chat is None:
        run = await get_or_create_lobby_run(session)
        chat = Chat(run_id=run.id, table_tag=table_tag, kind="table")
        session.add(chat)
        await session.commit()
        await session.refresh(chat)
    return chat


async def serialize_messages(session: AsyncSession, chat_id: uuid.UUID) -> list[dict]:
    rows = (
        await session.execute(
            select(Message, User.display_name)
            .outerjoin(User, User.id == Message.sender_id)
            .where(Message.chat_id == chat_id)
            .order_by(Message.sent_at)
            .limit(MAX_MESSAGES)
        )
    ).all()
    return [
        {
            "id": str(message.id),
            "name": display_name or "Guest",
            "text": message.text,
            "time": message.sent_at.isoformat() if message.sent_at else None,
        }
        for message, display_name in rows
    ]


async def post_table_message(
    session: AsyncSession, chat_id: uuid.UUID, sender_id: uuid.UUID, text: str
) -> Message:
    message = Message(chat_id=chat_id, sender_id=sender_id, text=text)
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message
