"""WebSocket router for announcements."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.deps import current_user
from ..db.session import get_session
from ..models.user import User
from ..models.piscine import EventInstance
from ..services.announcements import AnnouncementService
from ..services.schedule import ScheduleService
from ..websocket.announcements import ConnectionManager

router = APIRouter(tags=["websocket", "announcements"])


@router.websocket("/ws/announcements")
async def announcements_websocket(
    websocket: WebSocket,
    token: str = Query(None),
    session: AsyncSession = Depends(get_session)
):
    """WebSocket endpoint for announcements."""
    # Simple auth - in real impl would decode JWT
    user = None
    if token:
        # Try to find user from token (simplified)
        # For now, just accept if token is provided
        from ..core.deps import get_user_by_token
        try:
            user = await get_user_by_token(session, token)
        except Exception:
            user = None
    
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    manager = ConnectionManager()
    
    try:
        await manager.connect(websocket, str(user.id))
        
        snapshot = await AnnouncementService.get_events_for_user(str(user.id), session)
        await websocket.send_text(json.dumps(snapshot))
        
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, str(user.id))
    except Exception:
        manager.disconnect(websocket, str(user.id))


@router.get("/api/announcements")
async def get_announcements(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session)
):
    """Get announcements snapshot for non-WebSocket clients."""
    return await AnnouncementService.get_events_for_user(str(user.id), session)


@router.post("/api/piscine/{run_id}/regenerate-events")
async def regenerate_run_events(
    run_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session)
):
    """Regenerate EventInstances for a run (admin only)."""
    if user.role not in ("coding_mentor", "facility_manager", "mr_jonathan"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    instances = await ScheduleService.regenerate_for_run(
        uuid.UUID(run_id), 
        session
    )
    
    return {
        "message": f"Generated {len(instances)} event instances",
        "instance_count": len(instances)
    }


@router.post("/api/events/{event_id}/status")
async def update_event_status(
    event_id: str,
    status: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session)
):
    """Update event status (admin only)."""
    if user.role not in ("coding_mentor", "facility_manager", "mr_jonathan"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    event = (await session.execute(
        select(EventInstance).where(EventInstance.id == uuid.UUID(event_id))
    )).scalars().first()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event.status = status
    await session.commit()
    
    return {"message": "Event status updated", "event_id": event_id, "status": status}
