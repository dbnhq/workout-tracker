# Security

- Passwords: scrypt via Node crypto, per-user salt, timing-safe compare.
- Sessions: 32-byte random token, SHA-256 hash stored in DB, HttpOnly + SameSite=Lax cookie, 30-day expiry.
- Authorization: `auth` on every API route except register/login/health. Trainer client views and feedback require an existing trainer-client link. Workout mutations require ownership and an unfinished workout.
- Input: JSON size limit, email format check, 8+ character passwords, parameterized SQL throughout, no SQL in route handlers beyond the store.
- Headers: nosniff, frame deny, no-referrer.
- Login and register rate limit: 20 attempts per IP per 15 minutes, separate counters.
- Audit cadence: every build session re-runs `npm test` and reviews new routes for missing auth checks before pushing.
- Audit Nov 2, 2026: found and fixed routine-start authorization — a routine id alone was enough to start it. Now owner or assigned client only, covered by a smoke test.
