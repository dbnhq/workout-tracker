const { spawn } = require('child_process');
const assert = require('assert');

async function main() {
  const port = 3456;
  const proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(port), WORKOUT_DATA_DIR: '/tmp/wt-test-db' }, stdio: 'pipe' });
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
    console.log('smoke: all checks passed');
  } finally { proc.kill(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
