"""Contract tests that don't need Postgres: XP math, battery, grading, seat tags."""

from app.services.battery import FULL_MINUTES, is_dead
from app.services.grading import passed_bar, score_pct
from app.services.seating import threshold_count
from app.services.xp import partial_xp


def test_partial_xp_floor():
    assert partial_xp(10) == 3
    assert partial_xp(50) == 15


def test_grading_bar():
    assert score_pct(3, 5) == 60
    assert passed_bar(100, 100)
    assert not passed_bar(60, 100)


def test_battery_dead_blocks():
    assert is_dead(0)
    assert not is_dead(5)
    assert FULL_MINUTES == 30.0


def test_seat_tag_shape():
    assert "t1s3".startswith("t") and "s" in "t1s3"


def test_threshold_derived():
    assert threshold_count(212, 50) == 106
    assert threshold_count(212, 100) == 212
