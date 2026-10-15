# PierPlace Backend — Beginner's Runbook

> A step-by-step guide to starting the backend, proving the database is wired
> correctly, and clicking through the whole game flow. No prior backend
> experience assumed. Run everything from the repo root
> (`/home/gamp/codealong/pierplace`) unless a step says otherwise.

---

## The story in 30 seconds

Imagine you are running a coding school event:

- A **staff member** (mentor) opens an event called a *piscine run* — think of
  it as "today's 6-hour session".
- **Students** sign up, and each one is handed a *seat* (a chair in the
  building), a *laptop*, and a *welcome note* on their phone.
- Students then earn **XP** (points), drink water, attend briefings, move
  between floors, and get notified about everything.

This runbook walks you through playing **both roles** — the staff member and
a student — so you can prove every link in that chain works.

---

## 0. What you need before starting

- **Docker** — a tool that runs a real Postgres database in a sealed box on
  your machine, without you installing Postgres yourself. Check with
  `docker --version`.
- **Python 3.10+** — check with `python3 --version`.
- Two terminal windows (one for the server, one for commands).

---

## 1. Start the database

```sh
docker compose -f backend/docker-compose.yml up -d db
docker compose -f backend/docker-compose.yml ps
```

**Beginner scenario:** think of this as unlocking the school building and
turning the lights on. The first run downloads Postgres (a few hundred MB, so
go make tea). Afterwards it starts in seconds.

**What success looks like:** the `ps` command shows a row named `backend-db-1`
with status *Up* and port `5432`.

**If it fails:**

- `no configuration file provided` → you forgot `-f backend/docker-compose.yml`
  or you are not in the repo root.
- Port already in use → something else sits on 5432. Stop it, or ask for help
  changing the port.

---

## 2. Set up Python (skip if `backend/.venv` already exists)

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

**Beginner scenario:** this builds a private toolbox (a *virtual environment*)
just for this project, so the packages we install can't break anything else on
your computer. Takes a few minutes; silence is normal.

**What success looks like:** no red errors at the end.

---

## 3. Create the tables and fill the building

```sh
cd backend
export PIERPLACE_DATABASE_URL=postgresql+asyncpg://pierplace:pierplace@localhost:5432/pierplace
export PIERPLACE_JWT_SECRET=dev-secret
.venv/bin/python -m app.seed
```

**Beginner scenario:** the building exists but every room is empty. Seeding is
moving day — it builds all the tables in the database, then places 2 floors,
24 game tables, 240 seats, 25 XP levels, staff roles, and the weekly event
timetable. The two `export` lines are just telling the code *where the
database lives* and *what password to stamp login tokens with* (dev-only
values, never production).

**What success looks like:** it prints `seeded`.

**If it fails:**

- `connection refused` → the database from step 1 is not running. Go back up.
- `ModuleNotFoundError` → you are not inside the `backend/` folder, or step 2
  didn't finish.

---

## 4. Prove the database is wired right (the big checkpoint)

```sh
docker compose -f backend/docker-compose.yml exec db psql -U pierplace -c "\dt"
docker compose -f backend/docker-compose.yml exec db psql -U pierplace -c "select count(*) from seats;"
docker compose -f backend/docker-compose.yml exec db psql -U pierplace -c "select count(*) from game_tables;"
docker compose -f backend/docker-compose.yml exec db psql -U pierplace -c "select count(*) from levels;"
```

**Beginner scenario:** you are the inspector walking the building with a
clipboard, counting chairs. `psql` opens a direct line into the database and
each command asks it to count rows in a table.

**What success looks like — memorise these three numbers:**

| Table         | Expected | Meaning                                    |
|---------------|----------|--------------------------------------------|
| `seats`       | **240**  | 212 playable seats + 28 chill-area seats   |
| `game_tables` | **24**   | 18 playable tables + 6 chill tables        |
| `levels`      | **25**   | the 25 XP prestige bands                   |

If the numbers match, the schema, the seed data, and the database connection
are all correct. **This is the green light to proceed with everything else.**

---

## 5. Run the contract tests (no database needed)

```sh
.venv/bin/python -m pytest tests/ -q
```

**Beginner scenario:** pop quiz for the game rules *before* any players arrive.
It checks the pure maths — XP payouts, pass/fail grading, laptop battery logic,
seat thresholds. It doesn't touch the database, so it runs in under a second.

**What success looks like:** something like `6 passed`.

---

## 6. Start the server (keep this terminal open!)

```sh
export PIERPLACE_DATABASE_URL=postgresql+asyncpg://pierplace:pierplace@localhost:5432/pierplace
export PIERPLACE_JWT_SECRET=dev-secret
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Beginner scenario:** you flip the "OPEN" sign on the school reception desk.
The API now listens at `localhost:8000` on your own machine. `--reload` means
it restarts itself whenever you edit the code — handy while building.

**What success looks like:** logs ending in `Uvicorn running on
http://127.0.0.1:8000`. Leave this terminal alone and open a **second
terminal** for the rest. (Yes, the `export` lines are repeated — each terminal
window needs its own copy.)

---

## 7. Play the staff member: open an event

Run these in your **second terminal**:

```sh
# 1. Is anyone home? Expect {"ok":true}
curl localhost:8000/health
```

**Beginner scenario:** knocking on the reception door. If it answers, the
server is alive.

```sh
# 2. Register tester1 (staff account) and show their login token
curl -s -X POST localhost:8000/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"tester1","password":"secret123","display_name":"Tester"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
```

**Beginner scenario:** hiring your first staff member. The server hands back a
*token* — a stamped wristband they show at every door instead of logging in
each time. Copy it somewhere safe.

Staff powers (creating runs) need the `coding_mentor` role, so promote tester1
and log in again to get a wristband with the new powers:

```sh
docker compose -f backend/docker-compose.yml exec db psql -U pierplace \
  -c "update users set role='coding_mentor' where username='tester1';"

TOKEN1=$(curl -s -X POST localhost:8000/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"tester1","password":"secret123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 3. Open the event. Expect {"run_id":"...","threshold_count":106}
# NOTE: the quotes around the URL matter — zsh treats an unquoted ? as a
# glob pattern and fails with "no matches found".
RUN=$(curl -s -X POST "localhost:8000/piscine/runs?threshold_pct=50" \
  -H "Authorization: Bearer $TOKEN1"); echo $RUN
RUN_ID=$(echo $RUN | python3 -c "import sys,json; print(json.load(sys.stdin)['run_id'])")
```

**Beginner scenario:** the mentor declares "today's session is open, and we
start once half the seats (106 of 212) are filled." The server returns a
`run_id` — the session's ID badge. Everything from now on refers to it, and we
saved it into `$RUN_ID` so you don't have to copy-paste it.

```sh
# 4. Mentor tunes the start threshold and picks the briefing floor
curl -s -X PATCH localhost:8000/piscine/runs/$RUN_ID/threshold \
  -H "Authorization: Bearer $TOKEN1" -H 'Content-Type: application/json' \
  -d '{"threshold_pct":50}'; echo
curl -s -X POST localhost:8000/piscine/runs/$RUN_ID/briefing-floor \
  -H "Authorization: Bearer $TOKEN1" -H 'Content-Type: application/json' \
  -d '{"floor_code":"f1"}'; echo
```

**Beginner scenario:** the mentor adjusts the plan — "actually let's keep the
50% rule" and "everyone meets on floor 1 for briefing." Each call echoes the
saved value back, proving it stuck.

---

## 8. Play the student: enroll and live in the building

```sh
# 5. Register a student and enroll them. Expect {"seat_tag":"t1s1"}
TOKEN2=$(curl -s -X POST localhost:8000/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"player1","password":"secret123","display_name":"Player One"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s -X POST localhost:8000/piscine/runs/enroll \
  -H "Authorization: Bearer $TOKEN2" -H 'Content-Type: application/json' \
  -d "{\"run_id\":\"$RUN_ID\"}"; echo
```

**Beginner scenario:** a student walks in, gets handed a chair (`t1s1` — table
1, seat 1), a laptop, and a welcome note on their phone, all in one move.
Behind the scenes this single call writes to *four* tables (users, seats,
laptops, notifications). If a seat tag comes back, the whole chain is wired.

```sh
# 6. Rejoin snapshot: seat, laptop, XP, unread messages
curl -s "localhost:8000/me/state?run_id=$RUN_ID" -H "Authorization: Bearer $TOKEN2"; echo
# Laptop HUD — expect powered_on false, battery 30
curl -s localhost:8000/laptops/me -H "Authorization: Bearer $TOKEN2"; echo
# My XP and the leaderboard
curl -s localhost:8000/xp/me -H "Authorization: Bearer $TOKEN2"; echo
curl -s localhost:8000/xp/board -H "Authorization: Bearer $TOKEN2"; echo
```

**Beginner scenario:** imagine the student's phone refreshing after losing
signal — one snapshot tells them *where am I, is my laptop alive, how many
points do I have, what did I miss*. The board is the public scoreboard on the
wall (empty but working at this point).

```sh
# 7. Live a little: drink water (+5 XP), attend briefing (+20 XP), check the phone
curl -s -X POST "localhost:8000/behavior/water?run_id=$RUN_ID" -H "Authorization: Bearer $TOKEN2"; echo
curl -s -X POST localhost:8000/behavior/attend -H "Authorization: Bearer $TOKEN2" \
  -H 'Content-Type: application/json' -d "{\"run_id\":\"$RUN_ID\",\"kind\":\"briefing\"}"; echo
curl -s "localhost:8000/notify/inbox?run_id=$RUN_ID" -H "Authorization: Bearer $TOKEN2"; echo
```

**Beginner scenario:** the student grabs water from the dispenser, sits through
the opening briefing, then opens their phone inbox — the welcome note plus any
new announcements, unread first, exactly as a reconnecting player would see
them.

```sh
# 8. Walk upstairs and see who's around
curl -s -X POST localhost:8000/location/move -H "Authorization: Bearer $TOKEN2" \
  -H 'Content-Type: application/json' \
  -d "{\"run_id\":\"$RUN_ID\",\"floor_code\":\"f2\"}"; echo
curl -s "localhost:8000/location/roster?run_id=$RUN_ID" -H "Authorization: Bearer $TOKEN2"; echo
```

**Beginner scenario:** the student walks up to floor 2, and the roster is the
headcount — who is on which floor, in which seat. (If an event had *locked*
the building, the move would be refused with a `locked` error instead. That's
the lock system doing its job.)

---

## 9. Shutting down

```sh
# Stop the server: press Ctrl+C in its terminal.
# Stop the database (keeps all data for next time):
docker compose -f backend/docker-compose.yml down
# Full wipe (fresh start next time — deletes ALL data):
docker compose -f backend/docker-compose.yml down -v
```

**Beginner scenario:** closing up for the night. `down` locks the doors but
keeps everything inside; `down -v` also bulldozes the building, so next time
you start from step 3 with an empty plot.

---

## Known gap (not a bug — next build step)

Steps 7–8 prove accounts, runs, seats, laptops, XP, notifications, and
movement. **Quest/raid/checkpoint *content* (the actual coding tasks and
questions) is not seeded yet** — those endpoints work but return empty lists.
Writing that content is the "content/mentors" job in
`docs/piscine-backend-contract.md`, and it's the natural next step once the
numbers in step 4 check out.
