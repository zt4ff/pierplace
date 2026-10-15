# PierPlace Piscine — Database Structure & Relationships

Postgres is the source of truth. FastAPI writes it via REST; websocket only relays
read-only events. This doc lists every table, its key fields, and how tables join.
Field-level types are in `piscine-backend-contract.md` — this doc is the map.

## Entity relationship overview (text diagram)

```
role_permissions ──┐
                   ▼
users ──1:1── seats.assigned_owner (tXsY, sequential, held 6h)
  │  ├─1:1── laptops.owner (1 min charge = 30 min use, dead blocks Python)
  │  ├─1:N── piscine_enrollments ──N:1── piscine_runs
  │  ├─1:1── location_states (per run: floor/seat/lock)
  │  ├─1:N── submissions / checkpoint_attempts (full code+stdout+grade+XP)
  │  ├─N:M── raid_groups.member_ids[3] ──1:1── raid_defenses (1 mentor, 2 Qs, 30s)
  │  ├─1:N── xp_awards ──N:1── user_xp ──N:1── levels (25 fixed, top 1190)
  │  ├─1:N── notifications (phone feed, delivered/read, replay on rejoin)
  │  ├─1:N── chat_memberships ──N:1── chats ──1:N── messages
  │  ├─1:N── water_drinks (1/hour counted) + power_events
  │  └─1:N── mentor_triggers (subject) / handled_by mentor
game_tables (t1-t18 assignable, t19+ relax) ──1:N── seats (t1s1…)
beanbags (b1-b8, chat-only) · mentor_seats (m1..., always-on)
floors (f1,f2); waiting_area is a location zone, not a floor row
piscine_runs ──1:N── event_instances (+event_instance_floors for food)
  └── event_templates (fixed 90-min week, reused)
memos ──fan── notifications · meetings (quota-checked) ──lock── location_states
settings (threshold 50, memo_read 2, unlock 100, partial 30 — versioned per run)
```

## Tables by domain

### Identity & access
- **users**: `id PK, username UQ, password_hash (never returned), role,
  display_name, skin/hair/shirt, photo_url, wear_id, assigned_seat_tag UQ→seats,
  status/last_seen`. Reps are flagged candidates with seats + XP + privileges.
- **role_permissions**: `role PK` + flags (`call_meeting+quota, send_memo,
  edit_threshold, override_laptop, eject`). Extra row `mr_jonathan` unrestricted.
- **levels**: 25 rows, linear bands to top 1190, prestige only, board groups by level.

### Building (tags stable, never renumbered)
- **game_tables**: `tag PK (t1-t18 assignable, t19+ relax)`, floor, kind
  (collaboration/focus/project/quiet/window), seats_count, is_assignable.
- **seats**: `tag PK (t1s3)`, table_tag FK, seat_index, floor, assigned_owner FK
  (once, sequential), occupant FK (live, 1 max, owner-wins eject, held whole run),
  has_outlet true.
- **beanbags** `b1-b8`: floor, occupant 1-max, chat-only, no laptop/owner.
- **mentor_seats** `m1...`: floor, occupant mentor, always_on, mentor-only.
- Rule: 106 assignable/floor (212 total) + 18 relax/floor; threshold = 50% of
  assignable (106 today), mentors editable via settings versioned per run.

### Laptops & power
- **laptops**: exactly one of `seat_tag UQ` / `mentor_seat_tag UQ`; owner FK;
  `powered_on` (explicit button), `plugged`, `battery_minutes 0-30`, `last_tick`.
  Plugged=infinite; unplugged+on=drains wall-clock even idle; left-on-offline keeps
  draining; 0 blocks Python; mentor terminals skip drain. Non-owner open 403,
  mentor override logged.
- **power_events**: append-only (laptop, actor, action, battery before/after).

### Piscine run & schedule (fixed template)
- **piscine_runs**: status waiting|briefing|week1-4|finished; threshold_pct/count;
  briefing_floor (Jonathan); started/ends; current week/phase. Clock independent.
- **piscine_enrollments**: UQ(run,user) + UQ(run,seat); assigned seat; source.
- **event_templates**: fixed rows (briefing 0-10 wk1; Q1 10-30, Q2 30-50, Q3 50-65,
  Raid 65-80 + defense inside, Checkpoint 80-90; warn 2 min).
- **event_instances**: per run/week materialization (kind, opens/closes, floor,
  status scheduled|warned|open|locked|closed). Strict kinds auto-lock location.
- **event_instance_floors**: food per-floor pending|on_floor|done (5 runs/week).

### Location & locks (enforced, 403 on violation)
- **location_states**: PK(user,run); floor f1|f2|waiting_area; one of
  seat|beanbag|mentor ref; lock free|seat-locked|zone-locked|assembly-locked|offline.
- **movement_log**: append-only ok|rejected_locked|ejected (audit + idle detection).

### Work, grading, XP
- **quest_tasks**: week, quest 1-3, task 1-3, prompt, tests jsonb, xp 10.
- **submissions**: user/run/task + code/stdin/stdout/grader/score/xp(full or 30%)/
  is_best; unlimited Submits in window, best kept; Runs don't count.
- **raid_projects**: week, brief, question_bank >=2, xp_shared 50.
- **raid_groups**: run/week/project, member_ids[3], status.
- **raid_defenses**: UQ group; exactly 1 mentor; question_ids[2] from bank;
  opened/deadline +30s total; one shared answer first-wins; verdict
  pass|fail|timeout_fail. Pass→50 each even absent; fail→0. May run with 2 or
  reschedule (new row).
- **checkpoint_questions**: week, q 1-5, prompt/tests, xp 10/15/20/30/40,
  unlock_bar 100%. Q(n+1) hidden until Q(n) passes.
- **checkpoint_attempts**: like submissions + q number, unlocked_at, quit_submitted
  (quit = auto-submit).
- **xp_awards**: ledger (user, run nullable, source, ref, xp, at). Sources: quest,
  raid, checkpoint, briefing, assembly, no_miss, water, seat_found, battery_clean,
  table_chat, mentor_chat, memo_read (=2).
- **user_xp**: materialized (user PK, total, level FK). Board = group by level.
- **water_drinks**: user/run/at + counted (1/hour max → XP).

### Chat, memo, meeting, notify (one phone feed)
- **chats**: run + table nullable + kind table|staff.
- **chat_memberships**: chat/user/joined_at/left_at; join/leave implicit via
  sit/stand/eject; physical-table-only.
- **messages**: chat/sender/text<=2000/sent_at; squatters/mentors see only
  sent_at >= joined_at; members full. No DMs, no raid chats.
- **notifications**: per user (kind congrats|warn|start|end|memo|meeting|food|lock|
  xp|trigger; title/body; target all|floor|table|user; event ref;
  delivered/read). Rejoin replays undelivered/unread.
- **memos**: sender/run/target/body → fans to notifications; read → XP.
- **meetings**: caller/run/floor/opens_at/quota_consumed even if empty. Reps 1/week
  each, Jonathan unlimited, others none (role_permissions + weekly count).
- **mentor_triggers**: subject/run/kind stuck|idle|offline|low_battery/context/
  handled_by/at. Feeds mentor laptop + ID-card live state.

### Tuning
- **settings**: key PK (threshold_pct=50, memo_read_xp=2, unlock_bar=100,
  partial=30, water_xp...). Copied into run rows at creation — tuning never
  rewrites history.

## Key joins teammates use daily
- Who sits where: users → seats (assigned) + location_states (live) + game_tables.
- Mentor view: users + location + laptops + submissions + xp + triggers + notifications.
- Board: user_xp JOIN levels GROUP BY level.
- Rejoin: users + enrollments + location + laptop + user_xp + notifications
  (undelivered/unread) + event_instances (missed).
- Defense: raid_groups + defenses + projects(question_bank) + xp_awards.
- Chat: chats + memberships (joined_at cutoff) + messages.
