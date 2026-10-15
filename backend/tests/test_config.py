"""Render deploy config: DATABASE_URL fallback + asyncpg scheme (no DB needed)."""

import os

from app.core.config import Settings


def _settings(env: dict) -> Settings:
    old = {k: os.environ.pop(k, None) for k in ("PIERPLACE_DATABASE_URL", "DATABASE_URL")}
    try:
        os.environ.update(env)
        return Settings()
    finally:
        os.environ.pop("PIERPLACE_DATABASE_URL", None)
        os.environ.pop("DATABASE_URL", None)
        for k, v in old.items():
            if v is not None:
                os.environ[k] = v


def test_render_database_url_normalized():
    s = _settings({"DATABASE_URL": "postgres://u:p@host:5432/db"})
    assert s.database_url == "postgresql+asyncpg://u:p@host:5432/db"


def test_explicit_url_kept_and_upgraded():
    s = _settings({"PIERPLACE_DATABASE_URL": "postgresql://u:p@host:5432/db"})
    assert s.database_url == "postgresql+asyncpg://u:p@host:5432/db"


def test_explicit_wins_over_render():
    s = _settings({
        "PIERPLACE_DATABASE_URL": "postgresql+asyncpg://local/db",
        "DATABASE_URL": "postgres://u:p@host:5432/db",
    })
    assert s.database_url == "postgresql+asyncpg://local/db"


def test_local_default_without_env():
    assert _settings({}).database_url.startswith("postgresql+asyncpg://")
