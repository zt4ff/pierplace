from datetime import datetime, timezone

FULL_MINUTES = 30.0  # 1 min charge = 30 min use, even idle


def tick_minutes(powered_on: bool, plugged: bool, battery: float, since) -> float:
    """Wall-clock drain while powered on and unplugged. Plugged = infinite (full).

    Left-on-while-offline keeps draining — caller passes last_tick_at regardless
    of presence. Mentor terminals skip this helper entirely (always-on).
    """
    if plugged:
        return FULL_MINUTES
    if not powered_on:
        return battery
    now = datetime.now(timezone.utc)
    elapsed = (now - since).total_seconds() / 60.0 if since else 0.0
    return max(0.0, float(battery) - elapsed)


def is_dead(battery: float) -> bool:
    return float(battery) <= 0
