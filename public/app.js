const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, exercises = [], routines = [], activeId = null, restTimer = null;

async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => (t.hidden = true));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#tab-' + name).hidden = false;
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

async function boot() {
  try {
    const d = await api('/api/me');
    me = d.user; $('#authView').hidden = true; $('#appView').hidden = false; $('#logoutBtn').hidden = false;
    $('#who').textContent = `${me.name} · ${me.role}`;
    $('#greet').textContent = `Today · ${me.name}`;
    exercises = (await api('/api/exercises')).exercises;
    await loadAll();
  } catch { $('#authView').hidden = false; $('#appView').hidden = true; }
}
async function loadAll() {
  routines = await api('/api/routines');
  renderRoutines(); renderToday(); renderHistory(); renderCoach(); renderProgress();
}
function renderToday() {
  const assigned = routines.assigned || [];
  $('#assignedList').innerHTML = assigned.length ? assigned.map((r) => `<div><strong>${esc(r.title)}</strong> <button data-start="${r.id}">Start</button><span class="small"> ${r.exercises.map((e) => esc(e.name)).join(', ')}</span></div>`).join('') : '<p class="small">No assigned routines yet. Trainers assign from their dashboard once you link.</p>';
  document.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => startWorkout(Number(b.dataset.start), b.parentElement.querySelector('strong').textContent)));
  if (me.role === 'trainer') $('#trainerBox').innerHTML = `<p>Your invite code: <strong>${esc(me.invite_code || '')}</strong> — share it with clients.</p>`;
  else $('#trainerBox').innerHTML = `<div class="row"><input id="linkCode2" placeholder="Trainer invite code"><button id="linkBtn2">Link trainer</button></div>`;
  const lb = $('#linkBtn2'); if (lb) lb.onclick = async () => { try { await api('/api/link', 'POST', { code: $('#linkCode2').value }); alert('Linked!'); loadAll(); } catch (e) { alert(e.message); } };
  api('/api/body-weight').then((d) => { $('#bwList').innerHTML = d.weights.slice(0, 5).map((w) => `<div>${esc(w.date)} — ${w.weight}</div>`).join(''); }).catch(() => {});
  api('/api/workouts').then((d) => { $('#stats').textContent = `${d.stats.workouts} workouts · ${d.stats.sets} sets · ${d.stats.volume} total volume`; }).catch(() => {});
}
async function startWorkout(routineId, title) {
  const d = await api('/api/workouts', 'POST', { routine_id: routineId || null, title });
  activeId = d.id; renderActive(d.sets);
}
function renderActive(sets) {
  const byEx = {};
  sets.forEach((s) => (byEx[s.exercise_id] = byEx[s.exercise_id] || { name: s.name, rows: [] }).rows.push(s));
  $('#activeWorkout').innerHTML = `<h3>Workout in progress</h3>` + Object.values(byEx).map((g) => `<h4>${esc(g.name)}</h4>` + g.rows.map((s) => `<div class="set ${s.completed ? 'done' : ''}"><span>Set ${s.set_index}</span><input data-s="${s.id}" data-f="reps" type="number" value="${s.reps ?? ''}" placeholder="Reps"><input data-s="${s.id}" data-f="weight" type="number" step="0.5" value="${s.weight ?? ''}" placeholder="Weight"><button data-done="${s.exercise_id}:${s.set_index}">✓ Done</button></div>`).join('')).join('') + `<div class="row"><button id="finishBtn">Finish workout</button><span id="restOut" class="small"></span></div>`;
  document.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => {
    const [exId, idx] = b.dataset.done.split(':');
    const reps = document.querySelector(`[data-s][data-f="reps"]`);
    // find inputs in same row
    const row = b.parentElement;
    const r = row.querySelector('[data-f="reps"]').value, w = row.querySelector('[data-f="weight"]').value;
    await api(`/api/workouts/${activeId}/sets`, 'POST', { exercise_id: Number(exId), set_index: Number(idx), reps: Number(r), weight: Number(w) });
    row.classList.add('done'); startRest(90);
  }));
  $('#finishBtn').onclick = async () => { await api(`/api/workouts/${activeId}/finish`, 'POST', {}); activeId = null; $('#activeWorkout').innerHTML = '<p>Workout saved. Nice work.</p>'; loadAll(); };
}
function startRest(sec) {
  clearInterval(restTimer); let t = sec;
  restTimer = setInterval(() => { t--; $('#restOut').textContent = t > 0 ? `Rest: ${t}s` : 'Go — next set'; if (t <= 0) clearInterval(restTimer); }, 1000);
}
function renderRoutines() {
  $('#rExercises').innerHTML = '';
  addExRow();
  $('#myRoutines').innerHTML = routines.mine.map((r) => `<div><strong>${esc(r.title)}</strong><span class="small"> ${r.exercises.map((e) => `${esc(e.name)} ${e.sets}x${e.reps}`).join(', ')}</span></div>`).join('') || '<p class="small">No routines yet.</p>';
  const sel = $('#progEx'); sel.innerHTML = exercises.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
}
function addExRow() {
  const div = document.createElement('div'); div.className = 'row';
  div.innerHTML = `<select class="exSel">${exercises.map((e) => `<option value="${e.id}">${esc(e.name)} (${esc(e.muscle)})</option>`).join('')}</select><input class="exSets" type="number" value="3" placeholder="Sets"><input class="exReps" type="number" value="10" placeholder="Reps"><input class="exWeight" type="number" step="0.5" placeholder="Weight">`;
  $('#rExercises').appendChild(div);
}
$('#addExBtn').onclick = addExRow;
$('#saveRoutineBtn').onclick = async () => {
  const exs = [...document.querySelectorAll('#rExercises .row')].map((row) => ({ exercise_id: Number(row.querySelector('.exSel').value), sets: Number(row.querySelector('.exSets').value), reps: Number(row.querySelector('.exReps').value), weight: Number(row.querySelector('.exWeight').value) || null }));
  try { await api('/api/routines', 'POST', { title: $('#rTitle').value, notes: $('#rNotes').value, exercises: exs }); $('#rMsg').textContent = 'Routine saved.'; loadAll(); } catch (e) { $('#rMsg').textContent = e.message; }
};
async function renderHistory() {
  const d = await api('/api/workouts');
  $('#historyList').innerHTML = d.workouts.length ? d.workouts.map((w) => `<div><strong>${esc(w.title)}</strong> <span class="small">${new Date(w.started_at).toLocaleDateString()} ${w.finished_at ? '· finished' : '· in progress'}</span><div class="small">${w.sets.filter((s) => s.completed).map((s) => `${esc(s.name)} ${s.reps}x${s.weight ?? ''}`).join(', ')}</div></div>`).join('') : '<p class="small">No workouts yet. Start one on Today.</p>';
}
async function renderCoach() {
  if (me.role === 'trainer') {
    $('#clientCoachCard').hidden = true; $('#inviteCode').textContent = me.invite_code || '';
    const d = await api('/api/trainer/clients');
    $('#clientList').innerHTML = d.clients.length ? d.clients.map((c) => `<div><button data-client="${c.id}">${esc(c.name)}</button> <span class="small">${esc(c.email)}</span> <button data-assign="${c.id}">Assign routine…</button></div>`).join('') : '<p class="small">No clients linked yet. Share your invite code.</p>';
    document.querySelectorAll('[data-client]').forEach((b) => (b.onclick = async () => {
      const cd = await api(`/api/trainer/clients/${b.dataset.client}/workouts`);
      $('#clientDetail').innerHTML = `<h3>Recent workouts</h3><p class="small">${cd.stats.workouts} workouts · ${cd.stats.volume} volume</p>` + cd.workouts.slice(0, 5).map((w) => `<div><strong>${esc(w.title)}</strong> <span class="small">${new Date(w.started_at).toLocaleDateString()}</span></div>`).join('') + `<div class="row"><input id="fbBody" placeholder="Feedback for this client"><button id="fbBtn">Send feedback</button></div>`;
      $('#fbBtn').onclick = async () => { await api('/api/feedback', 'POST', { client_id: Number(b.dataset.client), body: $('#fbBody').value }); alert('Feedback sent.'); };
    }));
    document.querySelectorAll('[data-assign]').forEach((b) => (b.onclick = async () => {
      const rid = prompt('Routine ID to assign? Your routines:\n' + routines.mine.map((r) => `${r.id}: ${r.title}`).join('\n'));
      if (rid) { await api(`/api/routines/${rid}/assign`, 'POST', { client_id: Number(b.dataset.assign) }); alert('Assigned.'); }
    }));
  } else {
    $('#trainerCard').hidden = true;
    const t = await api('/api/my-trainers'); $('#trainerList').innerHTML = t.trainers.map((x) => `<div>${esc(x.name)} (${esc(x.email)})</div>`).join('') || '<p class="small">No trainer linked yet.</p>';
    const f = await api('/api/feedback'); $('#feedbackList').innerHTML = f.feedback.map((x) => `<div><strong>${esc(x.trainer_name)}:</strong> ${esc(x.body)}</div>`).join('');
  }
}
function renderProgress() {
  $('#progEx').onchange = async () => {
    const d = await api(`/api/progress/${$('#progEx').value}`);
    $('#progOut').innerHTML = d.best.max_weight ? `<p>Best: ${d.best.max_weight} · Est. 1RM: ${Math.round(d.best.est_1rm || 0)}</p>` : '<p class="small">No logged sets for this exercise yet.</p>';
  };
}
$('#plateBtn').onclick = () => {
  const target = Number($('#plateTarget').value); const bar = 20; let side = (target - bar) / 2;
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25]; const out = [];
  for (const p of plates) { const n = Math.floor(side / p); if (n) { out.push(`${n}x ${p}`); side -= n * p; } }
  $('#plateOut').textContent = target > bar ? `Per side: ${out.join(', ') || 'bar only'}` : 'Target must be over bar weight (20).';
};
$('#quickBtn').onclick = () => startWorkout(null, $('#quickTitle').value || 'Quick workout');
$('#bwBtn').onclick = async () => { await api('/api/body-weight', 'POST', { date: $('#bwDate').value || new Date().toISOString().slice(0, 10), weight: Number($('#bwVal').value) }); loadAll(); };
$('#registerBtn').onclick = async () => { try { await api('/api/auth/register', 'POST', { name: $('#name').value, email: $('#email').value, password: $('#password').value, role: $('#role').value }); boot(); } catch (e) { $('#authMsg').textContent = e.message; } };
$('#loginBtn').onclick = async () => { try { await api('/api/auth/login', 'POST', { email: $('#email').value, password: $('#password').value }); boot(); } catch (e) { $('#authMsg').textContent = e.message; } };
$('#logoutBtn').onclick = async () => { await api('/api/auth/logout', 'POST', {}); location.reload(); };
$('#linkBtn').onclick = async () => { try { await api('/api/link', 'POST', { code: $('#linkCode').value }); loadAll(); } catch (e) { alert(e.message); } };
boot();
