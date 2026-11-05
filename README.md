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

## Demo walkthrough

The full trainer → client loop, in about two minutes:

1. **Trainer signs up.** Open http://localhost:3000, register with role **trainer**. The Coach tab shows a 6-character invite code — share it with a client.
2. **Client links.** Register a second account with role **client**, open the Coach tab, paste the invite code, click **Link trainer**.
3. **Trainer builds a routine.** On the Routines tab, pick exercises from the 32-exercise library, set sets/reps/weight, and optionally group two exercises as a superset (Superset A/B/C). Save it.
4. **Trainer assigns it.** On the Coach tab, click **Assign routine…** next to the client's name and pick the routine.
5. **Client logs the workout.** On the Today tab the assigned routine appears — start it, tap **Done** per set (the rest timer starts automatically), add extra sets if needed, then **Finish workout**.
6. **Trainer coaches.** On the Coach tab, click the client to see their recent workouts, stats, and assigned program. Send feedback; the client sees it on their Coach tab.
7. **Client tracks progress.** The Progress tab shows recent total volume, per-exercise best weight, and estimated 1RM.

## Backup and restore

All data is one SQLite file: `data/workout-tracker.db` (or `$WORKOUT_DATA_DIR/workout-tracker.db`).

```bash
npm run backup   # writes backups/workout-tracker-YYYY-MM-DD-HHmmss.db
```

The script uses SQLite's online backup, so it is safe to run while the server is up — no half-copied WAL file. Keep the backup file somewhere off the machine.

**Restore:** stop the server, replace `data/workout-tracker.db` with the backup file, delete `data/workout-tracker.db-wal` and `data/workout-tracker.db-shm` if present, and start the server again. The smoke test verifies a backup restores with users, exercises, and finished workouts intact.

## Design docs

- `DESIGN.md` — requirements, data model, and decisions
- `ROADMAP.md` — week plan to v1, and what comes after
- `SECURITY.md` — auth, authorization checks, and audit notes
- `BUILD_LOG.md` — shipped changes, newest first
