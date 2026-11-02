# Design

## Problem
Logging a workout should take seconds between sets, not minutes of tapping. Trainers need to see what clients actually did, not just what was prescribed. Most trackers split those two jobs across apps or paywalls.

## Users
- **Client:** logs workouts, follows assigned routines, sees progress and trainer feedback.
- **Trainer:** builds routines, links clients by invite code, assigns routines, reviews client workouts, sends feedback.

## Core loop
Plan (routine) → Log (sets, one tap per set, rest timer) → Review (history, bests, volume) → Coach (feedback, next assignment).

## Decisions
- Lean stack (Node + Express + SQLite + vanilla JS, no build step) so the app runs anywhere and stays fast on a phone.
- Server is the authority: every mutation checks the session and, for trainer views, the trainer-client link. Clients can only touch their own workouts.
- Passwords hashed with scrypt (Node crypto, no extra dependency). Sessions are random tokens stored hashed, HttpOnly, SameSite=Lax.
- All SQL parameterized. No floats for money — not applicable here; weights are numbers, volume is rounded on read.
- Differentiators over a plain logger: 1-tap set completion with auto rest timer, plate calculator, estimated 1RM per exercise, trainer assignment + feedback in the same app, body-weight trend.

## Data model
users (role trainer/client, invite_code for trainers) → trainer_clients → routines → routine_exercises → assignments → workouts → workout_sets; feedback; body_weights; exercises (seeded library); sessions.

## Non-goals for v1
Payments, native apps, social feed, nutrition tracking, push notifications. Those are roadmap items, not v1 blockers.
