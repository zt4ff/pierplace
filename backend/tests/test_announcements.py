"""Regression tests for announcement scheduling and WebSocket manager sharing.

Tests:
1. Scheduling regression (Defect A):
   - Future opening time: event remains 'scheduled' and generates no opening notification.
   - Opening time arrived: event transitions to 'open' and generates 'activity_opened'.
   - Closing soon and closed transitions remain intact.
2. Shared manager regression (Defect B):
   - Router and scheduler reference the exact same ConnectionManager instance.
   - Scheduler broadcasts are delivered to clients connected via the shared manager.
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.scheduler import EventScheduler
from app.models.piscine import EventInstance
from app.routers.announcements import manager as router_manager
from app.websocket.announcements import ConnectionManager, manager as ws_manager


class FakeWebSocket:
    """Mock WebSocket for deterministic delivery tests."""

    def __init__(self) -> None:
        self.sent: list[str] = []
        self.accepted = False

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, text: str) -> None:
        self.sent.append(text)


def test_shared_connection_manager_instance():
    """Verify router and scheduler share the exact same ConnectionManager instance."""
    scheduler = EventScheduler()
    assert scheduler.manager is ws_manager
    assert router_manager is ws_manager
    assert isinstance(scheduler.manager, ConnectionManager)


def test_scheduler_custom_manager_injection():
    """Verify EventScheduler still accepts custom manager injection if needed."""
    custom_manager = ConnectionManager()
    scheduler = EventScheduler(manager=custom_manager)
    assert scheduler.manager is custom_manager
    assert scheduler.manager is not ws_manager


def test_future_event_remains_scheduled_without_broadcast():
    """Defect A regression: future opening time keeps event scheduled with no broadcast."""

    async def scenario():
        scheduler = EventScheduler()
        now = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)
        opens_at = now + timedelta(hours=2)
        closes_at = now + timedelta(hours=4)

        event = MagicMock(spec=EventInstance)
        event.id = uuid.uuid4()
        event.run_id = uuid.uuid4()
        event.template_id = None
        event.status = "scheduled"
        event.opens_at = opens_at
        event.closes_at = closes_at

        session = AsyncMock()

        with patch.object(
            scheduler, "_broadcast_event", new_callable=AsyncMock
        ) as mock_broadcast:
            await scheduler._check_event_transitions(event, now, session)

            assert event.status == "scheduled"
            mock_broadcast.assert_not_called()
            session.flush.assert_not_called()
            session.commit.assert_awaited_once()

    asyncio.run(scenario())


def test_opened_event_transitions_when_opens_at_arrived():
    """Verify event transitions to open and broadcasts when opening time has arrived."""

    async def scenario():
        scheduler = EventScheduler()
        now = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)
        opens_at = now - timedelta(minutes=5)
        closes_at = now + timedelta(hours=2)

        event = MagicMock(spec=EventInstance)
        event.id = uuid.uuid4()
        event.run_id = uuid.uuid4()
        event.template_id = None
        event.status = "scheduled"
        event.opens_at = opens_at
        event.closes_at = closes_at

        session = AsyncMock()

        with patch.object(
            scheduler, "_broadcast_event", new_callable=AsyncMock
        ) as mock_broadcast:
            await scheduler._check_event_transitions(event, now, session)

            assert event.status == "open"
            mock_broadcast.assert_awaited_once_with(
                event, "activity_opened", session
            )
            session.flush.assert_awaited_once()
            session.commit.assert_awaited_once()

    asyncio.run(scenario())


def test_closing_soon_transition_preserved():
    """Verify event transitions to closing_soon when warning threshold is reached."""

    async def scenario():
        scheduler = EventScheduler()
        now = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)
        opens_at = now - timedelta(hours=1)
        # default warning_seconds is 120 (2 minutes); close in 60 seconds
        closes_at = now + timedelta(seconds=60)

        event = MagicMock(spec=EventInstance)
        event.id = uuid.uuid4()
        event.run_id = uuid.uuid4()
        event.template_id = None
        event.status = "open"
        event.opens_at = opens_at
        event.closes_at = closes_at

        session = AsyncMock()

        with patch.object(
            scheduler, "_broadcast_event", new_callable=AsyncMock
        ) as mock_broadcast:
            await scheduler._check_event_transitions(event, now, session)

            assert event.status == "closing_soon"
            mock_broadcast.assert_awaited_once_with(
                event, "activity_closing_soon", session
            )
            session.flush.assert_awaited_once()
            session.commit.assert_awaited_once()

    asyncio.run(scenario())


def test_closed_transition_preserved():
    """Verify open or closing_soon event transitions to closed when closes_at has passed."""

    async def scenario():
        scheduler = EventScheduler()
        now = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)
        opens_at = now - timedelta(hours=2)
        closes_at = now - timedelta(seconds=1)

        event = MagicMock(spec=EventInstance)
        event.id = uuid.uuid4()
        event.run_id = uuid.uuid4()
        event.template_id = None
        event.status = "closing_soon"
        event.opens_at = opens_at
        event.closes_at = closes_at

        session = AsyncMock()

        with patch.object(
            scheduler, "_broadcast_event", new_callable=AsyncMock
        ) as mock_broadcast:
            await scheduler._check_event_transitions(event, now, session)

            assert event.status == "closed"
            mock_broadcast.assert_awaited_once_with(
                event, "activity_closed", session
            )
            session.flush.assert_awaited_once()
            session.commit.assert_awaited_once()

    asyncio.run(scenario())


def test_scheduled_event_past_close_transitions_directly_to_closed():
    """Verify a scheduled event whose closes_at has passed transitions directly to closed."""

    async def scenario():
        scheduler = EventScheduler()
        now = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)
        opens_at = now - timedelta(hours=3)
        closes_at = now - timedelta(hours=1)

        event = MagicMock(spec=EventInstance)
        event.id = uuid.uuid4()
        event.run_id = uuid.uuid4()
        event.template_id = None
        event.status = "scheduled"
        event.opens_at = opens_at
        event.closes_at = closes_at

        session = AsyncMock()

        with patch.object(
            scheduler, "_broadcast_event", new_callable=AsyncMock
        ) as mock_broadcast:
            await scheduler._check_event_transitions(event, now, session)

            assert event.status == "closed"
            mock_broadcast.assert_awaited_once_with(
                event, "activity_closed", session
            )
            session.flush.assert_awaited_once()
            session.commit.assert_awaited_once()

    asyncio.run(scenario())


def test_scheduler_broadcast_delivers_to_shared_manager_clients():
    """Defect B regression: scheduler broadcasts reach clients on the shared manager."""

    async def scenario():
        # Use an isolated manager for delivery assertion to keep test deterministic
        shared_manager = ConnectionManager()
        scheduler = EventScheduler(manager=shared_manager)

        user_id = str(uuid.uuid4())
        run_id = uuid.uuid4()

        socket = FakeWebSocket()
        await shared_manager.connect(socket, user_id)
        assert user_id in shared_manager.active_connections

        event = MagicMock(spec=EventInstance)
        event.id = uuid.uuid4()
        event.run_id = run_id

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [user_id]
        session.execute = AsyncMock(return_value=mock_result)

        mock_event_data = {
            "type": "activity_opened",
            "event_id": str(event.id),
            "title": "Hackathon Opening",
        }

        with patch(
            "app.services.announcements.AnnouncementService.create_activity_event",
            new_callable=AsyncMock,
            return_value=mock_event_data,
        ):
            await scheduler._broadcast_event(event, "activity_opened", session)

        assert len(socket.sent) == 1
        delivered = json.loads(socket.sent[0])
        assert delivered == [mock_event_data]

        shared_manager.disconnect(socket, user_id)
        assert user_id not in shared_manager.active_connections

    asyncio.run(scenario())


def test_default_scheduler_uses_global_manager_for_delivery():
    """Verify that EventScheduler() default manager delivers through ws_manager."""

    async def scenario():
        scheduler = EventScheduler()
        assert scheduler.manager is ws_manager

        user_id = f"test-user-{uuid.uuid4()}"
        run_id = uuid.uuid4()
        socket = FakeWebSocket()

        await ws_manager.connect(socket, user_id)
        try:
            event = MagicMock(spec=EventInstance)
            event.id = uuid.uuid4()
            event.run_id = run_id

            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [user_id]
            session.execute = AsyncMock(return_value=mock_result)

            payload = {"type": "activity_opened", "title": "Global Manager Test"}
            with patch(
                "app.services.announcements.AnnouncementService.create_activity_event",
                new_callable=AsyncMock,
                return_value=payload,
            ):
                await scheduler._broadcast_event(event, "activity_opened", session)

            assert len(socket.sent) == 1
            assert json.loads(socket.sent[0]) == [payload]
        finally:
            ws_manager.disconnect(socket, user_id)
            assert user_id not in ws_manager.active_connections

    asyncio.run(scenario())
