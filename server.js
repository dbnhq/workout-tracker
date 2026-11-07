const express = require('express');
const path = require('path');
const { openDb, createStore } = require('./db/store');
const { hashPassword, verifyPassword, newToken, hashToken, newInviteCode } = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.WORKOUT_DATA_DIR || path.join(__dirname, 'data');
const db = openDb(DATA_DIR);
const store = createStore(db);

const app = express();
app.use(express.json({ limit: '100kb' }));
// Security headers first, so static files get them too
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function parseCookie(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) {
      try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
      catch { out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
    }
  });
  return out;
}
function auth(req, res, next) {
  const token = parseCookie(req).wt_session;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const user = store.getSessionUser(hashToken(token));
  if (!user) return res.status(401).json({ error: 'Session expired' });
  req.user = user;
  next();
}
function requireRole(role) {
  return (req, res, next) => (req.user.role === role ? next() : res.status(403).json({ error: 'Wrong role' }));
}
function send(res, code, obj) { return res.status(code).json(obj); }
function validEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
// SQLite datetime format, so expiry compares correctly against datetime('now')
function sqliteExpiry(days) { return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19); }

// Auth rate limits, per IP, in memory: 20 attempts per 15 minutes per endpoint
const attempts = { login: new Map(), register: new Map() };
function authAllowed(kind, ip) {
  const now = Date.now();
  const list = (attempts[kind].get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts[kind].set(ip, list);
  return list.length < 20;
}
function recordAttempt(kind, ip) { attempts[kind].set(ip, [...(attempts[kind].get(ip) || []), Date.now()]); }

app.post('/api/auth/register', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!authAllowed('register', ip)) return send(res, 429, { error: 'Too many attempts, try again later' });
  recordAttempt('register', ip);
  const { name, email, password, role } = req.body || {};
  if (!name || !validEmail(email) || typeof password !== 'string' || password.length < 8 || !['trainer', 'client'].includes(role))
    return send(res, 400, { error: 'Name, valid email, 8+ character password, and trainer/client role required' });
  if (store.getUserByEmail(email)) return send(res, 409, { error: 'Email already registered' });
  const invite = role === 'trainer' ? newInviteCode() : null;
  const info = store.createUser(name.trim(), email.toLowerCase(), hashPassword(password), role, invite);
  const user = store.getUserById(info.lastInsertRowid);
  const token = newToken();
  store.createSession(hashToken(token), user.id, sqliteExpiry(30));
  res.setHeader('Set-Cookie', `wt_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`);
  return send(res, 201, { user });
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!authAllowed('login', ip)) return send(res, 429, { error: 'Too many attempts, try again later' });
  const { email, password } = req.body || {};
  const row = email ? store.getUserByEmail(email) : null;
  if (!row || !verifyPassword(password || '', row.password_hash)) { recordAttempt('login', ip); return send(res, 401, { error: 'Invalid email or password' }); }
  const user = store.getUserById(row.id);
  const token = newToken();
  store.createSession(hashToken(token), user.id, sqliteExpiry(30));
  res.setHeader('Set-Cookie', `wt_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`);
  return send(res, 200, { user });
});

app.post('/api/auth/logout', auth, (req, res) => {
  store.deleteSession(hashToken(parseCookie(req).wt_session));
  res.setHeader('Set-Cookie', 'wt_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return send(res, 200, { ok: true });
});

app.get('/api/me', auth, (req, res) => send(res, 200, { user: req.user }));
app.get('/api/exercises', auth, (req, res) => send(res, 200, { exercises: store.exercises() }));

app.get('/api/routines', auth, (req, res) => {
  const mine = store.myRoutines(req.user.id).map((r) => ({ ...r, exercises: store.routineExercises(r.id) }));
  const assigned = req.user.role === 'client' ? store.assignedRoutines(req.user.id).map((r) => ({ ...r, exercises: store.routineExercises(r.id) })) : [];
  return send(res, 200, { mine, assigned });
});

function validRoutineExercises(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) return false;
  return exercises.every((e) => e && Number.isInteger(e.exercise_id) && e.exercise_id > 0 &&
    (e.sets === undefined || (Number.isInteger(e.sets) && e.sets > 0 && e.sets <= 20)) &&
    (e.reps === undefined || (Number.isInteger(e.reps) && e.reps > 0 && e.reps <= 200)) &&
    (e.weight === undefined || e.weight === null || (typeof e.weight === 'number' && Number.isFinite(e.weight) && e.weight >= 0)) &&
    (e.rest_seconds === undefined || e.rest_seconds === null || (Number.isInteger(e.rest_seconds) && e.rest_seconds >= 0 && e.rest_seconds <= 3600)) &&
    (e.superset_group === undefined || e.superset_group === null || (Number.isInteger(e.superset_group) && e.superset_group >= 1)));
}

app.post('/api/routines', auth, (req, res) => {
  const { title, notes, exercises } = req.body || {};
  if (!title || !validRoutineExercises(exercises)) return send(res, 400, { error: 'Title and at least one valid exercise required' });
  // Validate exercise ids exist before creating anything, so a bad id can't leave a half-built routine
  if (exercises.some((e) => !store.getExercise(e.exercise_id))) return send(res, 400, { error: 'Unknown exercise' });
  const info = store.createRoutine(req.user.id, title.trim(), notes || '');
  exercises.forEach((e, i) => {
    if (e.exercise_id) store.addRoutineExercise(info.lastInsertRowid, e.exercise_id, i, e.sets || 3, e.reps || 10, e.weight ?? null, e.rest_seconds ?? 90, e.superset_group ?? null);
  });
  return send(res, 201, { id: info.lastInsertRowid });
});

app.post('/api/routines/:id/assign', auth, requireRole('trainer'), (req, res) => {
  const routine = store.getRoutine(Number(req.params.id));
  if (!routine || routine.owner_id !== req.user.id) return send(res, 403, { error: 'Not your routine' });
  const clientId = Number((req.body || {}).client_id);
  if (!store.isLinked(req.user.id, clientId)) return send(res, 403, { error: 'Client is not linked to you' });
  store.assignRoutine(routine.id, req.user.id, clientId);
  return send(res, 200, { ok: true });
});

app.post('/api/routines/:id/duplicate', auth, (req, res) => {
  const routine = store.getRoutine(Number(req.params.id));
  if (!routine || routine.owner_id !== req.user.id) return send(res, 403, { error: 'Not your routine' });
  const info = store.createRoutine(req.user.id, routine.title + ' copy', routine.notes);
  store.routineExercises(routine.id).forEach((e, i) => store.addRoutineExercise(info.lastInsertRowid, e.exercise_id, i, e.sets, e.reps, e.weight, e.rest_seconds, e.superset_group));
  return send(res, 201, { id: info.lastInsertRowid });
});

app.post('/api/link', auth, requireRole('client'), (req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const trainer = store.getUserByInvite(code);
  if (!trainer) return send(res, 404, { error: 'Invite code not found' });
  store.linkClient(trainer.id, req.user.id);
  return send(res, 200, { trainer: { id: trainer.id, name: trainer.name } });
});

app.get('/api/trainer/clients', auth, requireRole('trainer'), (req, res) => send(res, 200, { clients: store.trainerClients(req.user.id) }));
app.get('/api/my-trainers', auth, requireRole('client'), (req, res) => send(res, 200, { trainers: store.myTrainers(req.user.id) }));

app.get('/api/trainer/clients/:id/workouts', auth, requireRole('trainer'), (req, res) => {
  const clientId = Number(req.params.id);
  if (!store.isLinked(req.user.id, clientId)) return send(res, 403, { error: 'Client is not linked to you' });
  const workouts = store.userWorkouts(clientId).map((w) => ({ ...w, sets: store.workoutSets(w.id) }));
  return send(res, 200, { workouts, stats: store.stats(clientId) });
});

app.get('/api/trainer/clients/:id/routines', auth, requireRole('trainer'), (req, res) => {
  const clientId = Number(req.params.id);
  if (!store.isLinked(req.user.id, clientId)) return send(res, 403, { error: 'Client is not linked to you' });
  const routines = store.assignedRoutines(clientId).map((r) => ({ ...r, exercises: store.routineExercises(r.id) }));
  return send(res, 200, { routines });
});

app.post('/api/feedback', auth, requireRole('trainer'), (req, res) => {
  const { client_id, workout_id, body } = req.body || {};
  if (!body || !store.isLinked(req.user.id, Number(client_id))) return send(res, 403, { error: 'Client is not linked to you or feedback is empty' });
  // A workout reference must belong to the same client, so feedback can't be pinned to someone else's session
  if (workout_id) {
    const w = store.getWorkout(Number(workout_id));
    if (!w || w.user_id !== Number(client_id)) return send(res, 403, { error: 'Workout does not belong to this client' });
  }
  store.addFeedback(req.user.id, Number(client_id), workout_id ? Number(workout_id) : null, body.trim());
  return send(res, 201, { ok: true });
});
app.get('/api/feedback', auth, requireRole('client'), (req, res) => send(res, 200, { feedback: store.feedbackForClient(req.user.id) }));

app.post('/api/workouts', auth, (req, res) => {
  const { routine_id, title } = req.body || {};
  const routine = routine_id ? store.getRoutine(Number(routine_id)) : null;
  if (routine_id && !routine) return send(res, 404, { error: 'Routine not found' });
  // Only the owner or an assigned client may start a routine. Guessing an id is not access.
  if (routine && routine.owner_id !== req.user.id && !store.isAssigned(routine.id, req.user.id)) return send(res, 403, { error: 'Routine not available to you' });
  const info = store.createWorkout(req.user.id, routine_id ? Number(routine_id) : null, (title || (routine ? routine.title : 'Quick workout')).trim());
  if (routine) {
    store.routineExercises(routine.id).forEach((e) => {
      for (let i = 0; i < e.sets; i++) store.db.prepare('INSERT INTO workout_sets (workout_id,exercise_id,set_index,reps,weight,completed) VALUES (?,?,?,?,?,0)').run(info.lastInsertRowid, e.exercise_id, i + 1, e.reps, e.weight);
    });
  }
  return send(res, 201, { id: info.lastInsertRowid, sets: store.workoutSets(info.lastInsertRowid), routine_exercises: routine ? store.routineExercises(routine.id) : [] });
});

app.get('/api/workouts', auth, (req, res) => {
  const workouts = store.userWorkouts(req.user.id).map((w) => ({ ...w, sets: store.workoutSets(w.id) }));
  return send(res, 200, { workouts, stats: store.stats(req.user.id) });
});

app.post('/api/workouts/:id/sets', auth, (req, res) => {
  const workout = store.getWorkout(Number(req.params.id));
  if (!workout || workout.user_id !== req.user.id || workout.finished_at) return send(res, 403, { error: 'Workout not available' });
  const { exercise_id, set_index, reps, weight, rpe } = req.body || {};
  if (!exercise_id || !set_index) return send(res, 400, { error: 'Exercise and set required' });
  if (!Number.isInteger(Number(set_index)) || Number(set_index) < 1) return send(res, 400, { error: 'Set must be a positive number' });
  for (const [key, v] of [['reps', reps], ['weight', weight], ['rpe', rpe]]) {
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return send(res, 400, { error: `${key} must be a number` });
  }
  // Mark a planned set complete, or add an extra set
  const existing = store.db.prepare('SELECT * FROM workout_sets WHERE workout_id=? AND exercise_id=? AND set_index=?').get(workout.id, exercise_id, set_index);
  if (existing) {
    store.db.prepare('UPDATE workout_sets SET reps=?, weight=?, rpe=?, completed=1 WHERE id=?').run(reps ?? existing.reps, weight ?? existing.weight, rpe ?? null, existing.id);
  } else {
    store.addSet(workout.id, exercise_id, set_index, reps, weight, rpe);
  }
  return send(res, 200, { sets: store.workoutSets(workout.id) });
});

app.post('/api/workouts/:id/finish', auth, (req, res) => {
  const workout = store.getWorkout(Number(req.params.id));
  if (!workout || workout.user_id !== req.user.id) return send(res, 403, { error: 'Not your workout' });
  store.finishWorkout(workout.id, (req.body || {}).notes || '');
  return send(res, 200, { ok: true });
});

app.get('/api/progress/:exerciseId', auth, (req, res) => {
  const id = Number(req.params.exerciseId);
  return send(res, 200, { best: store.exerciseBest(req.user.id, id), history: store.exerciseHistory(req.user.id, id) });
});

app.post('/api/body-weight', auth, (req, res) => {
  const { date, weight } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Number(weight)) || Number(weight) <= 0) return send(res, 400, { error: 'Date (YYYY-MM-DD) and a positive weight required' });
  store.addBodyWeight(req.user.id, date, Number(weight));
  return send(res, 201, { ok: true });
});
app.get('/api/body-weight', auth, (req, res) => send(res, 200, { weights: store.bodyWeights(req.user.id) }));

app.get('/api/health', (req, res) => send(res, 200, { ok: true }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`workout-tracker on http://localhost:${PORT}`));
}
module.exports = { app, store };
