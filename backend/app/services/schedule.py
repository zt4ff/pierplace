"""Service for generating EventInstances from EventTemplates."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.piscine import EventTemplate, EventInstance, PiscineRun
from ..models.building import Seat


class ScheduleService:
    """Service for managing event instance generation from templates."""
    
    @staticmethod
    async def generate_event_instances(
        run: PiscineRun, 
        session: AsyncSession
    ) -> List[EventInstance]:
        """Generate EventInstances for a PiscineRun from its EventTemplates."""
        templates = (await session.execute(
            select(EventTemplate)
        )).scalars().all()
        
        created_instances = []
        
        for template in templates:
            for week_number in template.week_applies:
                existing = await session.execute(
                    select(EventInstance).where(
                        and_(
                            EventInstance.run_id == run.id,
                            EventInstance.template_id == template.id,
                            EventInstance.week_number == week_number
                        )
                    )
                ).scalars().first()
                
                if existing:
                    continue
                
                run_start = run.started_at or datetime.now(timezone.utc)
                event_date = run_start + timedelta(weeks=week_number - 1)
                
                if template.day_of_week is not None:
                    current_weekday = event_date.weekday()
                    days_ahead = (template.day_of_week - current_weekday) % 7
                    event_date += timedelta(days=days_ahead)
                
                if template.hour is not None:
                    event_date = event_date.replace(hour=template.hour, minute=0)
                
                if template.minute is not None:
                    event_date = event_date.replace(minute=template.minute)
                
                event_date += timedelta(minutes=template.offset_minutes)
                
                opens_at = event_date
                closes_at = event_date + timedelta(minutes=template.duration_minutes)
                
                event_instance = EventInstance(
                    id=uuid.uuid4(),
                    run_id=run.id,
                    template_id=template.id,
                    week_number=week_number,
                    kind=template.kind,
                    opens_at=opens_at,
                    closes_at=closes_at,
                    floor_code=None,
                    status="scheduled"
                )
                
                session.add(event_instance)
                created_instances.append(event_instance)
        
        await session.commit()
        return created_instances
    
    @staticmethod
    async def update_event_statuses(session: AsyncSession) -> None:
        """Update statuses of all EventInstances based on current time."""
        now = datetime.now(timezone.utc)
        
        instances = (await session.execute(
            select(EventInstance).where(
                EventInstance.status.in_(["scheduled", "open", "closing_soon"])
            )
        )).scalars().all()
        
        for instance in instances:
            if instance.template_id:
                template = (await session.execute(
                    select(EventTemplate).where(
                        EventTemplate.id == instance.template_id
                    )
                )).scalars().first()
                
                if not template:
                    continue
                
                if instance.opens_at > now:
                    if instance.status != "scheduled":
                        instance.status = "scheduled"
                        await session.flush()
                elif instance.closes_at <= now:
                    if instance.status != "closed":
                        instance.status = "closed"
                        await session.flush()
                else:
                    warning_seconds = template.warn_minutes_before * 60
                    time_until_close = instance.closes_at - now
                    
                    if time_until_close.total_seconds() <= warning_seconds:
                        if instance.status != "closing_soon":
                            instance.status = "closing_soon"
                            await session.flush()
                    else:
                        if instance.status != "open":
                            instance.status = "open"
                            await session.flush()
    
    @staticmethod
    async def regenerate_for_run(
        run_id: uuid.UUID, 
        session: AsyncSession
    ) -> List[EventInstance]:
        """Regenerate all EventInstances for a run (idempotent)."""
        await session.execute(
            EventInstance.__table__.delete().where(EventInstance.run_id == run_id)
        )
        
        run = (await session.execute(
            select(PiscineRun).where(PiscineRun.id == run_id)
        )).scalars().first()
        
        if not run:
            return []
        
        return await ScheduleService.generate_event_instances(run, session)
