# PierPlace Piscine — Backend Contract (Team Build Base)

> Status: **design-locked, no code yet**. This doc is the source of truth for all
> backend/frontend/websocket teammates. FastAPI + Postgres implement exactly this.
> WS teammate relays read-only events only — all truth lives in REST + Postgres.

## 0. What we are building

6-hour piscine trials (4 weeks x 1.5h) that qualify candidates for the main program.
Frontend game-pass stays (character + photo ID + 3 puzzles). On pass, candidate gets
assigned seat + laptop, joins timed quests/raids/checkpoints, earns weighted XP
toward 25 levels. Mentors/reps run meetings, defenses, memos. Everything timed,
location-locked, notified via one phone feed.

## 1. Locked decisions (do not re-litigate without the DB owner)

- Roles: `candidate, coding_mentor, facility_manager, male_rep, female_rep`.
  Reps are candidates with privileges (call meeting 1/week each + broadcast memo).
  Other mentors memo-only. Mr Jonathan unrestricted. Food sharers are NOT users.
- Threshold: 50% of assignable seats, adjustable by mentors (stored setting).
- Seats: `tXsY` global tags, 1 seat <-> 1 laptop, sequential first-free, owner-wins
  instant eject, 1 occupant max, held whole 6h even if offline (no backfill).
- Inventory/floor: assignable 106/floor (Collab 2x18 + Focus 4x10 + Project 3x10),
  relax 18/floor chat-only no-laptop (Quiet 2x6 + Window 1x2 extendable + Beanbags 4
  as `b1-b8`), mentor corner `m1...` always-on mentor-only. 212 assignable total.
  Tags: assignable `t1-t18`, relax `t19+`, beanbags `b1-b8`, mentors `m1...`.
  Floor derived from table — tags never renumbered.
- Location: DB-enforced locks `free|seat-locked|zone-locked|assembly-locked|offline`.
  Illegal moves -> 403. Waiting area is a tracked zone.
- Laptops: every sit has outlet. 1 min charge = 30 min wall-clock use even idle.
  Plugged = infinite. Explicit power-button state. Left-on-while-offline keeps
  draining. Dead (=0) blocks Python. API rejects non-owner open; mentors override
  + logged. Mentor terminals skip drain.
- Piscine clock independent — leaving never pauses. Offline = frozen XP, missed
  events, lost no-miss bonus. Rejoin lands same seat. Must power Off before leaving.
- Week template (fixed, reused): Wk1 0-10 briefing (Jonathan picks floor, enforced),
  then every week Q1 10-30, Q2 30-50, Q3 50-65, Raid 65-80 (defense inside),
  Checkpoint 80-90. 4 weeks ~6h.
- Food: run at start of every quest+raid+checkpoint = 5/week, concurrent,
  floor-by-floor, event-only tracking.
- Notifications = one phone feed (email+push). Stored per user with
  delivered/read flags. 2-min warn + start for raid/checkpoint/briefing + ad-hoc
  meetings. Strict events auto-lock on countdown. Congrats email contains seat tag.
- Grading: auto-graded. Quest 10 XP x9/weekx4=360, unlimited Submits in window,
  best kept, fail 30% floor; casual Runs don't count. Raid pass 50 shared x4=200,
  fail 0. Checkpoint Q1-Q5 10/15/20/30/40 =115/weekx4=460, sequential invisible
  until prior passes 100% bar, fail 30% does not unlock, one-shot, quit=auto-submit.
  Per attempt stores full code+stdin+stdout+grader+XP (mentor activity view).
- Defense: 3-group + exactly 1 mentor, 2 Qs from pre-banked set per project,
  30s total both, timeout=fail, one shared answer box first-submit wins, no
  per-person attribution, pass->all 3 share (even absent), fail->0. May run with 2
  or reschedule.
- Behavior XP (220 total): briefing 20, assembly 10x4=40, no-miss 15x4=60, water
  5x6=30 (dispenser+Drink, 1/hour max), seat-found 10, battery-clean 5x4=20,
  table-chat 5x4=20, mentor-chat 5x4=20. Memo-read 2 XP (default).
- Max: tasks 1020 + behavior 220 = 1240 perfect -> top 1190 (minus 50).
  25 linear bands ~47.6 XP, prestige only, live board, instant level-up.
- Chat: physical-table only. Squat Table 5 = join Table 5, lose own-table until back.
  Eject cuts instantly. Forward-only history for squatters/mentors. Mentors sit to chat.
  Stored: tables + staff chats. No DMs, no raid chats.
- Memo: targeted all|floor:X|table:Y via phone feed, small XP on read.
  Meeting: enforced-gather like briefing, quota consumed even if empty.
- Permissions map `role_permissions` (rep meeting+memo, mentor memo+threshold-edit,
  Jonathan all). Checked on every gated call.
- Triggers for mentors: stuck|idle|offline|low_battery.
- Auth additive: username+password + existing character/photo/puzzles kept.
  Seeded staff. JWT bearer reused for HTTP + WS.
- ID card: mentors see ALL student details.
- API = all truth via REST. WS = read-only broadcast. Position/seat actions are
  low-frequency REST POSTs. Rejoin = GET /me/state snapshot + missed replay.

## 2. Entities & relationships

users (uuid + username UQ + role + character + photo + wear_id + assigned_seat_tag UQ
  + status/last_seen) — reps are flagged candidates.
role_permissions (role PK + meeting quota + memo/threshold/override/eject flags;
  mr_jonathan row unrestricted).
levels (1-25 fixed bands, top 1190 capped).
floors (f1,f2); waiting_area is a location zone, not a floor row.
game_tables (tag PK t1-t18 assignable, t19+ relax; floor, kind, seats_count,
  is_assignable; never renumbered).
seats (tag PK t1s3; table_tag FK; seat_index; floor; assigned_owner_id nullable;
  occupant_user_id nullable 1-max; has_outlet true; held whole run).
beanbags (b1-b8; floor; occupant 1-max; chat-only).
mentor_seats (m1...; floor; occupant mentor; always_on).
laptops (1-1 seats + mentor terminals; owner; powered_on explicit; plugged;
  battery 0-30; last_tick; CHECK one seat ref; dead blocks Python).
power_events (append-only: laptop, actor, action, battery before/after).
piscine_runs (status waiting|briefing|week1-4|finished; threshold_pct default 50;
  threshold_count derived; briefing_floor; started/ends; current week/phase).
piscine_enrollments (UQ run+user; UQ run+seat; assigned seat; source).
event_templates (fixed week: kind, week_applies, offset, duration, lock, warn=2).
event_instances (per run/week: kind, opens/closes, floor, status
  scheduled|warned|open|locked|closed).
event_instance_floors (food per-floor pending|on_floor|done).
location_states (PK user+run; floor f1|f2|waiting_area; seat|beanbag|mentor ref;
  lock free|seat-locked|zone-locked|assembly-locked|offline).
movement_log (append-only ok|rejected_locked|ejected).
quest_tasks (week, quest 1-3, task 1-3, prompt, tests jsonb, xp 10).
submissions (user, run, task, code, stdin, stdout, grader jsonb, score, xp full/30%,
  is_best; unlimited Submits, best kept; Runs don't count).
raid_projects (week, brief, question_bank >=2, xp_shared 50).
raid_groups (run, week, project, member_ids[3], status).
raid_defenses (UQ group; mentor exactly 1; question_ids[2]; opened/deadline +30s;
  shared answer first-wins; verdict pass|fail|timeout_fail).
checkpoint_questions (week, q 1-5, prompt, tests, xp 10/15/20/30/40, unlock 100%).
checkpoint_attempts (like submissions + q number, unlocked_at, quit_submitted).
xp_awards (ledger: user, run nullable, source, ref, xp, at).
user_xp (materialized: user PK, total, level FK; board groups by level).
water_drinks (user, run, at, counted 1/hour max).
chats (run + table nullable + kind table|staff).
chat_memberships (chat, user, joined_at, left_at; eject/stand cuts).
messages (chat, sender, text<=2000, sent_at; forward-only for squatters/mentors).
notifications (per-user: kind congrats|warn|start|end|memo|meeting|food|lock|xp|
  trigger; title/body; target all|floor|table|user; event ref; delivered/read).
memos (sender, run, target, body; fans to notifications; read->XP).
meetings (caller, run, floor, opens_at, quota_consumed even if empty).
mentor_triggers (subject, run, kind stuck|idle|offline|low_battery, context,
  handled_by/at).
settings (key PK: threshold_pct=50, memo_read_xp=2, unlock_bar=100, partial=30,
  water_xp...; copied into run rows at creation so tuning never rewrites history).

## 3. REST contract (names only)

auth: POST register/login (public), GET /me/state (snapshot: seat, clock, lock,
  laptop, XP/level, unread, quotas).
seats: POST assign (game-pass, sequential), sit, stand, eject (owner/mentor).
location: POST move (403 when locked), GET me + run roster.
piscine: POST runs, PATCH threshold (mentor), POST enroll/start/briefing-floor.
events: GET schedule/instances/food-floor-status (server ticks warn/start/lock).
laptops: POST open (owner/override, dead->409), power, plug; GET me.
quests: GET tasks; POST submit (window+laptop+lock checked; stores full attempt).
raids: GET groups; POST groups/submit; defenses open/answer/verdict (+30s).
checkpoints: GET unlocked only; POST submit (seat-locked own chair; fail 30% no unlock).
xp: GET me + board?level (live). Behavior: POST water/attend/chat-participation;
  memo-read via notify/read.
chat: GET messages (forward-only enforced); POST messages (must be seated there).
notify: GET inbox; POST read (memo->XP); POST memos/send; POST meetings/call
  (quota-checked).
mentors: GET triggers/activity/id-card; POST trigger handle.

Errors: 401 unauth; 403 locked|not_owner|no_quota|wrong_role + reason;
404 unknown tag; 409 occupied|dead_battery|window_closed|timeout; 422 validation.
Every write returns new state (location/lock/battery/XP delta).

## 4. WS contract (read-only relay, names only)

piscine.started, event.warned, event.started, event.closed, lock.applied,
seat.ejected, chat.message, xp.awarded, level.up, battery.low, trigger.created,
meeting.called, memo.sent, food.on_floor, defense.opened, defense.decided.
No writes over socket. Reconnect = GET /me/state + replay undelivered/unread.

## 5. Team task split (proposed)

- DB/REST owner (you): Postgres + FastAPI truth, JWT, seat assignment, locks,
  ticking (warn/start/lock), auto-grader hook, XP/levels, permissions, replay.
- WS teammate: relay above events, JWT reuse, presence fan-out, no writes.
- Frontend: game-pass kept + username/password added; seat-find by tag; laptop
  power/plug/battery HUD; locks enforced visually + 403 surfacing; phone feed
  inbox with read receipts; table chat forward-only; checkpoint lock + quit-submit;
  offline/rejoin snapshot.
- Content/mentors: seed quest tasks, raid projects + question banks, checkpoint Qs,
  XP values, briefing text, threshold tuning.

## 6. Invariants teammates must not break

1. Tag stability: never renumber tX/bX/mX; additions append.
2. One live occupant per seat; owner-wins; relax/beanbag no ownership.
3. Seat held whole run; no mid-run backfill.
4. Clock independent; offline never pauses; missed = missed.
5. Laptop off required before offline; drain is wall-clock even idle.
6. Forward-only chat for non-members; physical-table-only access.
7. Defense 30s total, timeout=fail, shared box, shared XP.
8. Every state change via REST; WS read-only; rejoin replays notifications.

## 7. Open defaults (change by PR)

memo_read_xp=2, unlock_bar=100%, partial=30%, water 5/hr, bands linear to 1190.
Threshold 50% adjustable by mentors.
