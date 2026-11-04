"""WebSocket connection manager for announcements."""

import json
from typing import Dict, Set, List
from datetime import datetime, timezone

import websockets
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.piscine import EventInstance, Enrollment
from ..models.user import User


class ConnectionManager:
    """Manager for WebSocket connections."""
    
    def __init__(self):
        # user_id -> set of websocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Pending events per user
        self.pending_events: Dict[str, List[dict]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        """Connect a WebSocket for a user."""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
            self.pending_events[user_id] = []
        
        self.active_connections[user_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, user_id: str):
        """Disconnect a WebSocket."""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                del self.pending_events[user_id]
    
    def add_pending_event(self, user_id: str, event: dict):
        """Add a pending event for a user."""
        if user_id not in self.pending_events:
            self.pending_events[user_id] = []
        
        self.pending_events[user_id].append(event)
    
    async def send_pending_events(self, user_id: str):
        """Send all pending events to a user."""
        if user_id not in self.pending_events or user_id not in self.active_connections:
            return
        
        events = self.pending_events[user_id]
        if not events:
            return
        
        for websocket in list(self.active_connections.get(user_id, set())):
            try:
                await websocket.send_text(json.dumps(events))
            except Exception:
                continue
        
        self.pending_events[user_id] = []
    
    async def broadcast_to_enrolled_users(
        self, 
        run_id: str, 
        event: dict,
        session: AsyncSession
    ):
        """Broadcast event to all users enrolled in a run."""
        enrollments = (await session.execute(
            select(Enrollment.user_id).where(Enrollment.run_id == run_id)
        )).scalars().all()
        
        for user_id in enrollments:
            self.add_pending_event(str(user_id), event)
            await self.send_pending_events(str(user_id))
