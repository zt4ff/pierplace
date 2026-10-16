# PierPlace Piscine — Game Flow (Read Me First)

Start here. This is the whole 6-hour story in order, written so every teammate
(frontend, WS, mentors, content) knows what to build and when it fires.
Schema details: `piscine-database.md`. API/WS names: `piscine-backend-contract.md`.

## Cast
- **Candidate** (e.g. Freedom): registers (username+password, character, photo),
  plays game test (3 puzzles), gets ID + seat + laptop on pass.
- **Reps** (female rep): candidates with reserved seats + privileges
  (call meeting 1/week each + broadcast memo). Same XP + board.
- **Coding mentors** (Jonathan, Femi, Ezekiel, Emmanuel): seeded accounts,
  roam free always, memo-only except Jonathan (meetings + anything anytime),
  eject squatters/no-shows, run raid defenses (1 mentor per group), view all
  student details via ID/activity laptop. Mentor corner `m1...` always-on.
- **Facility Manager**: seeded, roaming, no seat, chats + triggers.
- Food sharers: not users, just a timed floor-by-floor event.

## The journey (Freedom's path)

### 1. Register → game → ID
Freedom registers (username+password added; character colors, name, photo,
wear-ID, 3 puzzles all stay as in frontend). On pass: congrats notification in
the one phone feed containing seat tag (e.g. `t7s4`, also printed on ID card).
No guidance — painted `tXsY`/`bX` tags are enough. Sequential first-free
assignable seat (212 total) + its 1-1 laptop. Mentors can already view his ID.

### 2. Find seat → settle
Freedom walks both floors (tracked: floor + seat + lock). Sitting elsewhere:
allowed if free (squat) but laptop blocked (owner-only, 403; mentors override),
chat joins the table he's physically at (forward-only history), own-table chat
unreachable until back. Owner arrival ejects instantly (1 occupant max). Relax
spots (quiet desks, window bar, `b1-b8` beanbags): anyone anytime, chat-only.
Mentors may eject squatters anytime, even mid-event, without breaking attempts.

### 3. Laptop + battery
Every sit has an outlet, light always on. Explicit power button state stored.
1 min charge = 30 min wall-clock use even idle; plugged = infinite; unplugged+on
drains; left-on-while-offline keeps draining (must power Off before leaving);
dead blocks Python. Mentor `m` terminals always-on, no battery.

### 4. Waiting → threshold → briefing
Piscine needs 50% of assignable filled (106/212 today, mentors adjustable).
Running piscine → newcomers wait in tracked `waiting_area`. No piscine → roam
floors, no events. At threshold: clock starts (independent, never pauses),
briefing warned (2-min) then 3-min assembly on Jonathan's floor (enforced lock).
Missing = frozen XP + lost no-miss bonus. Seat held whole 6h even if offline.

### 5. Weekly cycle x4 (90 min each)
Fixed template every week: Q1 10-30, Q2 30-50, Q3 50-65, Raid 65-80 (defense
inside), Checkpoint 80-90 (Week 1 prefixed 0-10 briefing). Food run at the start
of every quest+raid+checkpoint (5/week, concurrent). Warnings (2-min + start)
for raid/checkpoint/briefing + Jonathan/rep ad-hoc meetings (reps 1/week each).
- **Quest**: 3 quests x 3 Python tasks (10 XP each). Unlimited Submits in window,
  best kept, fail = 30%. Casual Runs don't count. Full code+in/out+grade stored.
- **Raid**: 3-person groups, one shared project, one shared answer box
  first-submit wins. Defense = exactly 1 mentor, 2 Qs from pre-banked set,
  30s total both, timeout = fail. Pass → 50 each even absent; fail → 0.
  May run with 2 or reschedule.
- **Checkpoint**: 5 sequential Qs (10/15/20/30/40), next hidden until current
  passes 100% bar. Seat-locked own chair + laptop. Quit/lid-close = auto-submit.
  Fail 30% but no unlock.
- **Behavior XP**: briefing 20, assembly 10/week, no-miss 15/week, water 5/hour
  (dispenser + Drink, 1/hour max), seat-found 10, battery-clean 5/week,
  table-chat 5/week, mentor-chat 5/week, memo-read 2. Perfect total 1240 → top
  band 1190; 25 linear prestige levels, live board.

### 6. Chat, memo, meeting, triggers
Table chat = physical presence only (join/leave via sit/stand/eject). Mentors sit
to chat. Memos target all|floor|table, read → small XP. Meetings enforced-gather,
quota consumed even if empty. Idle/stuck/offline/low-battery raise mentor
triggers (who-to-approach queue).

### 7. Leave & rejoin (simulation rule)
Anyone may go offline anytime; clock keeps counting. Seat + laptop held, XP
frozen, missed events missed. Return: same seat, possibly drained laptop,
`GET /me/state` snapshot + replay of undelivered/unread notifications.

## What each teammate builds
- **DB/REST (you)**: Postgres + FastAPI truth per contract; JWT for HTTP+WS;
  sequential assignment; lock enforcement (403); server ticking (warn/start/lock);
  auto-grader hook; XP/levels; permissions; replay flags.
- **WS**: read-only relay of named events; presence fan-out; JWT reuse; no writes.
- **Frontend**: keep game-pass, add username/password; seat-find by tag; laptop
  power/plug/battery HUD; lock visuals + 403 surfacing; phone inbox + read
  receipts; forward-only table chat; checkpoint lock + quit-submit; offline/rejoin.
- **Content/mentors**: seed quest tasks, raid projects + banks, checkpoint Qs,
  briefing text, XP numbers, threshold tuning, defense verdicts, trigger handling.

## Invariants (never break)
Tags never renumbered (append only). One occupant/seat. No mid-run backfill.
Offline never pauses clock. Laptop-off-before-offline. Forward-only squatter chat.
30s defense, timeout fail, shared XP. REST writes, WS reads. Rejoin replays.
