# Roadmap

Target: v1 finished by Monday, November 9, 2026.

## This week
- [x] Nov 2 — Repo, design, auth (trainer/client), exercise library, routines, assignment, workout logging, history, progress, feedback, smoke tests
- [x] Nov 2 — Audit pass 1: security review (routine-start gap fixed), logging friction (Add set, routine duplication), progress volume chart
- [ ] Nov 5–6 — Audit pass 2: trainer workflow polish (client detail program view done Nov 2, routine duplication done, progress charts done, PWA install check done, superset display done Nov 3, mobile CSS pass done Nov 3, mobile UX static pass done Nov 6: inline routine assignment, numeric keyboards, 44px tab targets) — remaining: mobile UX check on a real phone; audit pass 3 done Nov 8 (set exercise validation, blank/non-string text guards)
- [x] Nov 7–8 — Hardening: rate limits done Nov 4, session expiry handling done Nov 4, backup/restore done Nov 5, README demo walkthrough done Nov 5 — remaining: none; pre-final audit done Nov 7 (input validation, feedback ownership, static-file headers, cookie parsing)
- [x] Nov 9 — Final audit, green tests, v1 tag, demo deploy note (final audit Nov 9: 51 smoke asserts green, live boot on the real DB, route auth + link checks + parameterized SQL re-verified, no stray mentions in repo/commits; tagged v1.0.0; no live demo deploy yet — local run only, deploy is a post-v1 item)

## After v1 (not blockers)
Mobile UX check on a real phone, live demo deploy, offline queue, program templates (multi-week), measurements beyond weight, exercise videos/notes, CSV export, native wrapper.
