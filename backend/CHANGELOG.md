# PierPlace Backend — Build Log

> **Every agent and teammate: read this first, write here always.**
> This file is the running memory of the backend. Any change to code,
> schema, seed data, or game rules gets one entry below (newest on top)
> BEFORE it is pushed. A new agent should be able to reconstruct the full
> story — and the current schema — from this file alone.

## How to log (convention)

- Newest entry on top, dated `YYYY-MM-DD`, with your name/role.
- Entry shape: **What changed → Why → How to verify → Anything teammates
  must know** (migration impact, new env var, broken compat).
- Schema changes are **allowed and expected** — but the entry MUST state the
  table/column, nullability/default, and what happens to existing databases
  (see "Schema-change rule" below).

## Schema-change rule

- You may add/alter tables and columns via normal PRs — no permission needed
  beyond review.
- Every schema change MUST have a CHANGELOG entry describing impact on
  **existing local databases**. Note: `app.seed` uses `create_all` (no
  migrations yet), which only *adds* missing tables — it never alters or
  backfills. So:
  - New **nullable** columns or columns with **Python-side defaults**: safe,
    just note it.
  - New **non-nullable, no-default** columns, renamed/dropped columns, new
    extensions: state the manual step (e.g. `docker compose down -v` +
    reseed, or the SQL to run).
- If we outgrow `create_all`, the team decision to adopt Alembic migrations
  gets logged here first.

---

## 2026-10-15 — claude-opus-5 (backend agent): Render deploy for issue #1

**What:** `backend/render.yaml` blueprint (managed Postgres 16 + web service,
`/health` check, generated JWT secret) + app reads Render's `DATABASE_URL`
(fallback when `PIERPLACE_DATABASE_URL` unset; `postgres://` auto-upgraded to
asyncpg in `app/core/config.py`) + 4 config tests + README deploy section.
**Why:** Issue #1 (Initialize postgres with Render) + FastAPI on Render.
**Verify:** 9 passed; YAML parses; app boots with a `postgres://` URL.
**Know:** Seed once via Render Shell after first deploy. Schema impact: none
(new files + additive validator only). Free-plan DB sleeps when idle.

## 2026-10-15 — claude-opus-5 (backend agent): PR #10 opened, live-verified

**What:** Pushed branch `backend/piscine-contract` and opened PR #10 into
`main` — the team build base (44 REST endpoints, seed, RUNBOOK, .env.example).
**Why:** So WS/frontend/content teammates can start building instantly.
**Verify:** PR #10 on GitHub; `pytest` 5 passed; seed counts 240/24/25/6.
**Know:** Test users from verification (tester1/player1/player2) live only in
the agent's local DB — the PR seeds a clean world.

## 2026-10-15 — claude-opus-5 (backend agent): live verification fixes

**What (4 fixes from running the stack for real):**
1. `mentor_triggers.context` had no column type → seed crashed with
   `MappedAnnotationError`. Now `JSONB` (`app/models/social.py`).
2. Postgres missing `citext` extension → `User.username` table creation
   failed. Seed now runs `CREATE EXTENSION IF NOT EXISTS citext` first
   (`app/seed.py`).
3. `passlib` incompatible with `bcrypt>=4.1` (`__about__` removed) → register
   500'd. Pinned `bcrypt==4.0.1` in `requirements.txt`.
4. Seat assignment ordered by string tag → first enroll got `t10s1` before
   `t2s1`. `first_free_assignable` now orders numerically
   (`substring(table_tag,2)::int, seat_index`). Verified next enroll = `t1s1`.
5. `POST /seats/sit` now syncs `LocationState` (seat + floor), so the roster
   reflects sitting.
**Why:** Contract says "sequential first-free" and all-truth-in-REST; string
sort and sit/move drift violated both.
**Verify:** Full smoke run — enroll → quest (10 XP best, 3 XP retake) →
checkpoint gating (403 locked) → raid pass (+50 shared) → player1 **98 XP,
level 3**; player2 50 XP. Math matches the contract ledger.
**Know:** Raw-SQL inserts must supply columns that only have Python-side
defaults (`sort_order`, `unlock_bar_pct`, …) — ORM writes are unaffected.

## 2026-10-15 — claude-opus-5 (backend agent): contract gap fill

**What:** Implemented the REST endpoints the scaffold was missing (§3):
location move/me/roster (new `routers/location.py`); threshold PATCH,
briefing-floor, food-floor-status; `laptops/me`; quest tasks, raid
groups + defense-open (+30s); `checkpoints/unlocked`; `xp/me`; behavior
attend + chat-participation; `notify/inbox`; mentor activity/id-card/
trigger-handle. Plus: quest best-kept demotion, checkpoint 100%-bar lock
enforcement, `threshold_count()` helper + test.
**Why:** Scaffold covered ~60% of the contract; teammates need the rest to
build against.
**Verify:** `py_compile` clean; route audit = 44 API routes + `/health`;
live smoke test above.
**Know:** No WS code here by design — WS teammate relays read-only events.

## 2026-10-15 — backend scaffold (prior session): models + routers + seed

**What:** Initial FastAPI + Postgres scaffold: all models (users, building,
piscine, work, social, xp), 8 routers, services (battery/grading/xp/seating/
permissions), idempotent seed (floors, t1–t18 assignable + relax tables,
beanbags b1–b8, mentor seats, 25 levels to 1190, roles incl. mr_jonathan row,
6-row week template), pure-function contract tests.
**Why:** Team build base per `docs/piscine-backend-contract.md`.
**Know:** Seed is idempotent — safe to re-run; relax/beanbag tags never
renumber.
