# Workout Tracker

Trainer and client workout tracking in one place: routines, fast set logging, progress, and coaching.

## What it does

- **Two roles, one app.** Sign up as a trainer or a client. Trainers share a 6-character invite code; clients enter it to link.
- **Fast logging for the gym floor.** Start a routine, tap Done per set, rest timer auto-starts, big touch targets, mobile-first.
- **Routines and assignments.** Trainers build routines from a 32-exercise library and assign them to linked clients. Clients also build their own.
- **Progress that adds up.** Per-exercise best weight and estimated 1RM, workout history, total volume, body-weight log, plate calculator.
- **Coaching loop.** Trainers see linked clients' recent workouts and stats, and send feedback clients see on their Coach tab.

## Run it

```bash
npm install
npm start   # http://localhost:3000
npm test    # smoke test: register, link, assign, log, finish, feedback, role gating
```

Stack: Node 22+, Express, SQLite (better-sqlite3), vanilla JS, no build step. Data lives in `data/workout-tracker.db` (override with `WORKOUT_DATA_DIR`).

## Design docs

- `DESIGN.md` — requirements, data model, and decisions
- `ROADMAP.md` — week plan to v1, and what comes after
- `SECURITY.md` — auth, authorization checks, and audit notes
- `BUILD_LOG.md` — shipped changes, newest first
