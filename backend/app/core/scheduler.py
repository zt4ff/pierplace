"""Background scheduler for event transitions."""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import SessionLocal
from ..models.piscine import EventInstance, Enrollment
from ..services.announcements import AnnouncementService
from ..websocket.announcements import ConnectionManager


class EventScheduler:
    """Background scheduler for event lifecycle transitions."""
    
    def __init__(self):
        self.manager = ConnectionManager()
        self.warning_thresholds = {
            "15min": timedelta(minutes=15),
            "5min": timedelta(minutes=5),
            "1min": timedelta(minutes=1)
        }
    
    async def start_scheduler(self):
        """Start the background scheduler."""
        asyncio.create_task(self._scheduler_loop())
    
    async def _scheduler_loop(self):
        """Main scheduler loop."""
        while True:
            try:
                await self._process_event_transitions()
                await asyncio.sleep(60)  # Check every minute
            except Exception as e:
                print(f"Scheduler error: {e}")
                await asyncio.sleep(60)
    
    async def _process_event_transitions(self):
        """Process all event status transitions."""
        async with SessionLocal() as session:
            now = datetime.now(timezone.utc)
            
            events = (await session.execute(
                select(EventInstance).where(
                    EventInstance.status.in_(["scheduled", "open", "closing_soon"])
                )
            )).scalars().all()
            
            for event in events:
                await self._check_event_transitions(event, now, session)
    
    async def _check_event_transitions(
        self, 
        event: EventInstance, 
        now: datetime, 
        session: AsyncSession
    ):
        """Check and process transitions for a single event."""
        old_status = event.status
        
        if event.opens_at > now and event.status == "scheduled":
            event.status = "open"
            await session.flush()
            await self._broadcast_event(event, "activity_opened", session)
        elif event.opens_at <= now:
            if event.closes_at <= now and event.status in ["open", "closing_soon"]:
                event.status = "closed"
                await session.flush()
                await self._broadcast_event(event, "activity_closed", session)
            elif event.status == "open" or event.status == "scheduled":
                template = event.template_id
                warning_seconds = 120  # default 2 minutes
                try:
                    from ..models.piscine import EventTemplate
                    if event.template_id:
                        tmpl = (await session.execute(
                            select(EventTemplate).where(EventTemplate.id == event.template_id)
                        )).scalars().first()
                        if tmpl:
                            warning_seconds = tmpl.warn_minutes_before * 60
                except Exception:
                    pass
                
                time_until_close = (event.closes_at - now).total_seconds()
                if time_until_close <= warning_seconds and event.status != "closing_soon":
                    event.status = "closing_soon"
                    await session.flush()
                    await self._broadcast_event(event, "activity_closing_soon", session)
                elif time_until_close > warning_seconds and event.status != "open":
                    event.status = "open"
                    await session.flush()
                    await self._broadcast_event(event, "activity_opened", session)
        
        try:
            await session.commit()
        except Exception:
            await session.rollback()
    
    async def _broadcast_event(
        self, 
        event: EventInstance, 
        event_type: str, 
        session: AsyncSession
    ):
        """Broadcast an event to relevant users."""
        try:
            event_data = await AnnouncementService.create_activity_event(
                event, event_type, session
            )
            
            enrollments = (await session.execute(
                select(Enrollment.user_id).where(Enrollment.run_id == event.run_id)
            )).scalars().all()
            
            for user_id in enrollments:
                self.manager.add_pending_event(str(user_id), event_data)
                await self.manager.send_pending_events(str(user_id))
        except Exception as e:
            print(f"Broadcast error: {e}")
