const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const port = 3456;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
  const proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(port), WORKOUT_DATA_DIR: dataDir }, stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 1200));
  const base = `http://localhost:${port}`;
  async function req(path, method, body, cookie) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j, cookie: r.headers.get('set-cookie') };
  }
  try {
    const health = await req('/api/health');
    assert.equal(health.status, 200);
    const trainer = await req('/api/auth/register', 'POST', { name: 'Tess Trainer', email: 'tess@example.com', password: 'password123', role: 'trainer' });
    assert.equal(trainer.status, 201, JSON.stringify(trainer.body));
    const tCookie = trainer.cookie.split(';')[0];
    assert.ok(trainer.body.user.invite_code, 'trainer gets invite code');
    const client = await req('/api/auth/register', 'POST', { name: 'Cal Client', email: 'cal@example.com', password: 'password123', role: 'client' });
    assert.equal(client.status, 201);
    const cCookie = client.cookie.split(';')[0];
    const link = await req('/api/link', 'POST', { code: trainer.body.user.invite_code }, cCookie);
    assert.equal(link.status, 200, JSON.stringify(link.body));
    const ex = await req('/api/exercises', 'GET', null, cCookie);
    assert.ok(ex.body.exercises.length >= 20);
    const routine = await req('/api/routines', 'POST', { title: 'Upper A', exercises: [{ exercise_id: ex.body.exercises[0].id, sets: 2, reps: 8, weight: 60 }] }, tCookie);
    assert.equal(routine.status, 201, JSON.stringify(routine.body));
    const assign = await req(`/api/routines/${routine.body.id}/assign`, 'POST', { client_id: client.body.user.id }, tCookie);
    assert.equal(assign.status, 200, JSON.stringify(assign.body));
    // Unlinked trainer must be blocked: use a second trainer
    const other = await req('/api/auth/register', 'POST', { name: 'Other', email: 'other@example.com', password: 'password123', role: 'trainer' });
    const blocked = await req(`/api/trainer/clients/${client.body.user.id}/workouts`, 'GET', null, other.cookie.split(';')[0]);
    assert.equal(blocked.status, 403);
    // Unassigned client must not start a trainer routine by guessing its id
    const stranger = await req('/api/auth/register', 'POST', { name: 'Sam Stranger', email: 'sam@example.com', password: 'password123', role: 'client' });
    const blockedStart = await req('/api/workouts', 'POST', { routine_id: routine.body.id }, stranger.cookie.split(';')[0]);
    assert.equal(blockedStart.status, 403, JSON.stringify(blockedStart.body));
    const dup = await req(`/api/routines/${routine.body.id}/duplicate`, 'POST', {}, tCookie);
    assert.equal(dup.status, 201, JSON.stringify(dup.body));
    // Supersets: two exercises grouped, one single; grouping survives duplication and workout start
    const ss = await req('/api/routines', 'POST', { title: 'Superset Test', exercises: [
      { exercise_id: ex.body.exercises[0].id, sets: 3, reps: 10, superset_group: 1 },
      { exercise_id: ex.body.exercises[1].id, sets: 3, reps: 10, superset_group: 1 },
      { exercise_id: ex.body.exercises[2].id, sets: 3, reps: 10 },
    ] }, tCookie);
    assert.equal(ss.status, 201, JSON.stringify(ss.body));
    const allRoutines = await req('/api/routines', 'GET', null, tCookie);
    const ssFound = allRoutines.body.mine.find((r) => r.id === ss.body.id);
    assert.deepEqual(ssFound.exercises.map((e) => e.superset_group), [1, 1, null]);
    const ssDup = await req(`/api/routines/${ss.body.id}/duplicate`, 'POST', {}, tCookie);
    assert.equal(ssDup.status, 201, JSON.stringify(ssDup.body));
    const afterDup = await req('/api/routines', 'GET', null, tCookie);
    const ssDupFound = afterDup.body.mine.find((r) => r.id === ssDup.body.id);
    assert.deepEqual(ssDupFound.exercises.map((e) => e.superset_group), [1, 1, null]);
    const ssWorkout = await req('/api/workouts', 'POST', { routine_id: ss.body.id }, tCookie);
    assert.equal(ssWorkout.status, 201, JSON.stringify(ssWorkout.body));
    assert.deepEqual(ssWorkout.body.routine_exercises.map((e) => e.superset_group), [1, 1, null]);
    const workout = await req('/api/workouts', 'POST', { routine_id: routine.body.id }, cCookie);
    assert.equal(workout.status, 201);
    assert.ok(workout.body.sets.length >= 2);
    const first = workout.body.sets[0];
    const done = await req(`/api/workouts/${workout.body.id}/sets`, 'POST', { exercise_id: first.exercise_id, set_index: first.set_index, reps: 8, weight: 60 }, cCookie);
    assert.equal(done.status, 200);
    const fin = await req(`/api/workouts/${workout.body.id}/finish`, 'POST', {}, cCookie);
    assert.equal(fin.status, 200);
    const prog = await req(`/api/progress/${first.exercise_id}`, 'GET', null, cCookie);
    assert.equal(prog.body.best.max_weight, 60);
    const fb = await req('/api/feedback', 'POST', { client_id: client.body.user.id, body: 'Great session' }, tCookie);
    assert.equal(fb.status, 201);
    // Trainer program view: linked trainer sees assigned routines, unlinked trainer is blocked
    const clientProg = await req(`/api/trainer/clients/${client.body.user.id}/routines`, 'GET', null, tCookie);
    assert.equal(clientProg.status, 200, JSON.stringify(clientProg.body));
    assert.ok(clientProg.body.routines.some((r) => r.id === routine.body.id && r.exercises.length >= 1));
    const progBlocked = await req(`/api/trainer/clients/${client.body.user.id}/routines`, 'GET', null, other.cookie.split(';')[0]);
    assert.equal(progBlocked.status, 403);
    // Login rate limit: 20 failed attempts per 15 minutes, then 429
    for (let i = 0; i < 20; i++) {
      const bad = await req('/api/auth/login', 'POST', { email: 'nobody@example.com', password: 'wrongpassword' });
      assert.equal(bad.status, 401, `attempt ${i + 1}: ${JSON.stringify(bad.body)}`);
    }
    const limited = await req('/api/auth/login', 'POST', { email: 'nobody@example.com', password: 'wrongpassword' });
    assert.equal(limited.status, 429, JSON.stringify(limited.body));
    // PWA files are served
    const sw = await fetch(base + '/sw.js');
    assert.equal(sw.status, 200);
    const manifest = await (await fetch(base + '/manifest.json')).json();
    assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
    // Backup: online backup against the live server DB, then verify it opens
    const backupPath = path.join(dataDir, 'backup-check.db');
    const { execFile } = require('child_process');
    await new Promise((resolve, reject) => execFile('node', ['scripts/backup.js', backupPath], { env: { ...process.env, WORKOUT_DATA_DIR: dataDir } }, (err) => (err ? reject(err) : resolve())));
    assert.ok(fs.existsSync(backupPath), 'backup file created');
    const Database = require('better-sqlite3');
    const copy = new Database(backupPath, { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) c FROM users').get().c, 4);
    assert.equal(copy.prepare('SELECT COUNT(*) c FROM exercises').get().c, 32);
    assert.equal(copy.prepare('SELECT COUNT(*) c FROM workouts WHERE finished_at IS NOT NULL').get().c, 1);
    copy.close();
    console.log('smoke: all checks passed');
  } finally { proc.kill(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
