"""Service for managing announcement events."""

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.piscine import EventInstance, Enrollment


class AnnouncementService:
    """Service for managing announcement events."""
    
    @staticmethod
    async def get_events_for_user(
        user_id: str,
        session: AsyncSession
    ) -> dict:
        """Get all relevant events for a user."""
        enrollments = (await session.execute(
            select(Enrollment).where(Enrollment.user_id == user_id)
        )).scalars().all()
        
        run_ids = [e.run_id for e in enrollments]
        
        if not run_ids:
            return {
                "type": "snapshot",
                "active": [],
                "upcoming": [],
                "timed": [],
                "server_time": datetime.now(timezone.utc).isoformat()
            }
        
        events = (await session.execute(
            select(EventInstance).where(
                EventInstance.run_id.in_(run_ids)
            ).order_by(EventInstance.opens_at)
        )).scalars().all()
        
        event_dicts = []
        for event in events:
            event_dicts.append({
                "id": str(event.id),
                "kind": event.kind,
                "title": AnnouncementService._get_event_title(event),
                "description": AnnouncementService._get_event_description(event),
                "opens_at": event.opens_at.isoformat(),
                "closes_at": event.closes_at.isoformat(),
                "is_timed": event.template_id is not None,
                "status": event.status,
                "week": event.week_number
            })
        
        now = datetime.now(timezone.utc)
        
        active = [e for e in event_dicts if e["status"] == "open"]
        upcoming = [e for e in event_dicts if e["status"] == "scheduled"]
        timed = [e for e in event_dicts if e["is_timed"] and e["status"] in ["open", "closing_soon"]]
        
        return {
            "type": "snapshot",
            "active": active,
            "upcoming": upcoming,
            "timed": timed,
            "server_time": now.isoformat()
        }
    
    @staticmethod
    def _get_event_title(event: EventInstance) -> str:
        """Generate event title based on kind."""
        titles = {
            "briefing": "Week 1 Briefing",
            "quest_open": f"Quest Week {event.week_number}",
            "raid_open": f"Raid Week {event.week_number}",
            "checkpoint_lock": f"Checkpoint Week {event.week_number}"
        }
        return titles.get(event.kind, f"Event Week {event.week_number}")
    
    @staticmethod
    def _get_event_description(event: EventInstance) -> str:
        """Generate event description based on kind."""
        descriptions = {
            "briefing": "Orientation session for new participants",
            "quest_open": "Quest challenges available for submission",
            "raid_open": "Group raid challenges opened",
            "checkpoint_lock": "Checkpoint questions for skill verification"
        }
        return descriptions.get(event.kind, f"{event.kind.replace('_', ' ').title()} event")
    
    @staticmethod
    async def create_activity_event(
        event: EventInstance,
        event_type: str,
        session: AsyncSession
    ) -> dict:
        """Create an activity event."""
        event_data = {
            "id": str(event.id),
            "kind": event.kind,
            "title": AnnouncementService._get_event_title(event),
            "description": AnnouncementService._get_event_description(event),
            "opens_at": event.opens_at.isoformat(),
            "closes_at": event.closes_at.isoformat(),
            "is_timed": event.template_id is not None,
            "status": event.status,
            "week": event.week_number,
            "event_type": event_type,
            "message": f"{event.kind.replace('_', ' ').title()} event",
            "server_time": datetime.now(timezone.utc).isoformat()
        }
        
        if event_type == "activity_opened":
            event_data["message"] = f"{event.kind.replace('_', ' ').title()} has started!"
        elif event_type == "activity_closing_soon":
            event_data["message"] = f"{event.kind.replace('_', ' ').title()} closes soon!"
            event_data["time_remaining"] = (event.closes_at - datetime.now(timezone.utc)).total_seconds()
        elif event_type == "activity_closed":
            event_data["message"] = f"{event.kind.replace('_', ' ').title()} has ended!"
        elif event_type == "activity_updated":
            event_data["message"] = f"{event.kind.replace('_', ' ').title()} schedule updated!"
        elif event_type == "activity_cancelled":
            event_data["message"] = f"{event.kind.replace('_', ' ').title()} has been cancelled!"
        
        return event_data
