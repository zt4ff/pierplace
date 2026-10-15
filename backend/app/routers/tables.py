"""Lobby table chat REST. Mirrors the frontend `/api/tables/:id/messages` shape.

Chat is physical-table scoped: a message is stored against the table the player
is sitting at and can only be read back from that same table.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from ..services.lobby import (
    get_or_create_table_chat,
    post_table_message,
    serialize_messages,
)
from ..services.players import upsert_player
from ..ws.presence import manager

router = APIRouter(prefix="/tables", tags=["tables"])

MAX_TEXT = 500


class MessageIn(BaseModel):
    text: str
    playerId: str | None = None
    name: str | None = None
    skin: str | None = None
    hair: str | None = None
    shirt: str | None = None


def _table_tag(table_id: str) -> str:
    table_id = (table_id or "").strip()
    if not table_id or len(table_id) > 64:
        raise HTTPException(status_code=404, detail="unknown_table")
    return table_id


@router.get("/{table_id}/messages")
async def list_messages(
    table_id: str,
    playerId: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    chat = await get_or_create_table_chat(session, _table_tag(table_id))
    return {"messages": await serialize_messages(session, chat.id)}


@router.post("/{table_id}/messages", status_code=201)
async def create_message(
    table_id: str,
    body: MessageIn,
    session: AsyncSession = Depends(get_session),
):
    tag = _table_tag(table_id)
    text = (body.text or "").strip()
    if not text or len(text) > MAX_TEXT:
        raise HTTPException(status_code=422, detail="bad_text")
    if body.playerId and manager.seated_elsewhere(body.playerId, tag):
        raise HTTPException(status_code=403, detail={"reason": "not_seated_here"})

    user = await upsert_player(
        session,
        {"name": body.name, "skin": body.skin, "hair": body.hair, "shirt": body.shirt},
    )
    chat = await get_or_create_table_chat(session, tag)
    await post_table_message(session, chat.id, user.id, text)
    return {"messages": await serialize_messages(session, chat.id)}
