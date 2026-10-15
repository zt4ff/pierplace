"""Idempotent seed: floors, tables, seats (106+18/floor), levels, templates, roles."""

from sqlalchemy import select, text

from .db.base import Base
from .db.session import SessionLocal, engine
from .models.building import Beanbag, Floor, GameTable, MentorSeat, Seat
from .models.piscine import EventTemplate
from .models.user import Level, RolePermission

LEVELS_TOP = 1190
LEVELS_N = 25


async def seed():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))  # User.username
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as s:
        for code, label in (("f1", "Floor 1"), ("f2", "Floor 2")):
            if not (await s.execute(select(Floor).where(Floor.code == code))).scalar_one_or_none():
                s.add(Floor(code=code, label=label))
        # Assignable t1-t18 (9/floor): collab 2x18, focus 4x10, project 3x10
        tag = 1
        per_floor = [("collaboration", 18), ("collaboration", 18), ("focus", 10), ("focus", 10),
                     ("focus", 10), ("focus", 10), ("project", 10), ("project", 10), ("project", 10)]
        for floor in ("f1", "f2"):
            for kind, count in per_floor:
                t = f"t{tag}"
                if not (await s.execute(select(GameTable).where(GameTable.tag == t))).scalar_one_or_none():
                    s.add(GameTable(tag=t, floor_code=floor, kind=kind, seats_count=count, is_assignable=True))
                    for i in range(1, count + 1):
                        s.add(Seat(tag=f"{t}s{i}", table_tag=t, seat_index=i, floor_code=floor, is_assignable=True))
                tag += 1
        # Relax: quiet 2x6/floor + window 1x2/floor (extendable), beanbags b1-b8
        for floor in ("f1", "f2"):
            for kind, count in (("quiet", 6), ("quiet", 6), ("window", 2)):
                t = f"t{tag}"
                if not (await s.execute(select(GameTable).where(GameTable.tag == t))).scalar_one_or_none():
                    s.add(GameTable(tag=t, floor_code=floor, kind=kind, seats_count=count, is_assignable=False))
                    for i in range(1, count + 1):
                        s.add(Seat(tag=f"{t}s{i}", table_tag=t, seat_index=i, floor_code=floor, is_assignable=False))
                tag += 1
        for i in range(1, 9):
            b = f"b{i}"
            if not (await s.execute(select(Beanbag).where(Beanbag.tag == b))).scalar_one_or_none():
                s.add(Beanbag(tag=b, floor_code="f1" if i <= 4 else "f2"))
        for i in range(1, 4):
            m = f"m{i}"
            if not (await s.execute(select(MentorSeat).where(MentorSeat.tag == m))).scalar_one_or_none():
                s.add(MentorSeat(tag=m, floor_code="f1", always_on=True))
        # Levels linear to 1190
        step = LEVELS_TOP / LEVELS_N
        for n in range(1, LEVELS_N + 1):
            lo = round((n - 1) * step)
            hi = round(n * step - 1) if n < LEVELS_N else LEVELS_TOP
            if not (await s.execute(select(Level).where(Level.level_number == n))).scalar_one_or_none():
                s.add(Level(level_number=n, min_xp=lo, max_xp=hi))
        # Roles (+ mr_jonathan unrestricted)
        roles = {
            "candidate": (False, None, False, False, False, False),
            "coding_mentor": (False, None, True, True, True, True),
            "mr_jonathan": (True, None, True, True, True, True),
            "facility_manager": (False, None, False, False, False, True),
            "male_rep": (True, 1, True, False, False, True),
            "female_rep": (True, 1, True, False, False, True),
        }
        for role, (meet, quota, memo, thresh, override, eject) in roles.items():
            if not (await s.execute(select(RolePermission).where(RolePermission.role == role))).scalar_one_or_none():
                s.add(RolePermission(role=role, can_call_meeting=meet, meeting_quota_per_week=quota,
                                     can_send_memo=memo, can_edit_threshold=thresh,
                                     can_override_laptop=override, can_eject=eject))
        # Fixed week template
        if not (await s.execute(select(EventTemplate))).scalars().first():
            for kind, weeks, off, dur, lock in [
                ("briefing", [1], 0, 10, "assembly-locked"),
                ("quest_open", [1, 2, 3, 4], 10, 20, None),
                ("quest_open", [1, 2, 3, 4], 30, 20, None),
                ("quest_open", [1, 2, 3, 4], 50, 15, None),
                ("raid_open", [1, 2, 3, 4], 65, 15, None),
                ("checkpoint_lock", [1, 2, 3, 4], 80, 10, "seat-locked"),
            ]:
                s.add(EventTemplate(kind=kind, week_applies=weeks, offset_minutes=off,
                                    duration_minutes=dur, lock_type=lock, warn_minutes_before=2))
        await s.commit()
    await seed_quest_tasks()
    print("seeded")


async def seed_quest_tasks():
    from .models.work import QuestTask

    async with SessionLocal() as s:
        if (await s.execute(select(QuestTask).limit(1))).scalar_one_or_none():
            return
        prompts = {
            1: "Write a function that solves this basic problem. Example: return the sum of two numbers a and b.",
            2: "Write code using control flow (if/else/loops) to solve this problem.",
            3: "Write a function with proper logic to solve this problem.",
        }
        for quest_number, prompt in prompts.items():
            for i in range(1, 6):
                s.add(QuestTask(
                    week=1,
                    quest_number=quest_number,
                    task_number=i,
                    prompt=f"Quest {quest_number} Question {i}: {prompt}",
                    tests={},
                    xp_value=10,
                    sort_order=i,
                ))
        await s.commit()


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed())
