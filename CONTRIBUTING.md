# Contributing — how we work without merge pain

> Read this before opening a branch. Five minutes here saves hours of
> conflict resolution later.

## Ownership map (who owns what)

| Area      | Path(s)            | Owner / notes                                    |
|-----------|--------------------|--------------------------------------------------|
| Backend   | `backend/`         | Backend owner. Others MAY change it (incl. DB schema) but MUST log in `backend/CHANGELOG.md` per the schema-change rule there |
| Frontend  | `src/`, `public/`, `index.html` | Frontend teammate(s)                      |
| Realtime  | `server/`          | WS/presence teammate (read-only relay of backend events) |
| Contract  | `docs/`            | Shared source of truth — changes need team agreement |

Stay inside your area per PR. Touching another area? Mention the owner in
the PR description.

## Branch + PR rules

- Branch names: `<area>/<short-topic>` — e.g. `backend/raid-defense`,
  `frontend/seat-map`, `server/presence`. One topic per branch.
- One PR = one reviewable chunk. Small PRs merge fast; giant PRs rot.
- Before opening (or when `main` moves under you):
  `git fetch origin && git merge origin/main` into your branch, resolve,
  re-run checks, then push. **Never merge another feature branch into yours
  — always merge `main`.**
- PR description must say: what changed, how you verified it, and anything
  that affects another area (new endpoint, changed payload, new env var).
- Backend PRs additionally need a `backend/CHANGELOG.md` entry (see the
  convention + schema-change rule at the top of that file).

## Definition of done (every PR)

- [ ] Scoped to one area; other areas untouched (or owner tagged)
- [ ] Checks pass (`backend`: `pytest`; frontend: build/lint per its README)
- [ ] Mergable with `main` — no conflicts (`gh pr view --json mergeStateStatus`)
- [ ] Log updated (`backend/CHANGELOG.md` for backend; note in PR body otherwise)
