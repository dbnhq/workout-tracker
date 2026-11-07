const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const EXERCISES = [
  ['Barbell Back Squat','Legs','Barbell','Feet shoulder-width, brace, sit hips back and down, drive up.'],
  ['Bench Press','Chest','Barbell','Retract shoulder blades, touch chest with control, press up.'],
  ['Deadlift','Back','Barbell','Hips back, lats tight, push the floor away, lock out tall.'],
  ['Overhead Press','Shoulders','Barbell','Ribs down, press straight up, head through at the top.'],
  ['Pull-Up','Back','Bodyweight','Full hang, pull chest to bar, lower with control.'],
  ['Barbell Row','Back','Barbell','Hinge, pull to lower ribs, no torso bounce.'],
  ['Romanian Deadlift','Legs','Barbell','Soft knees, hips back, feel hamstrings load.'],
  ['Leg Press','Legs','Machine','Feet mid-platform, full range without hips lifting.'],
  ['Leg Curl','Legs','Machine','Control the lowering, no hip lift.'],
  ['Leg Extension','Legs','Machine','Pause briefly at the top, lower slowly.'],
  ['Dumbbell Bench Press','Chest','Dumbbell','Neutral start, press up and slightly in.'],
  ['Incline Dumbbell Press','Chest','Dumbbell','Bench at 30 degrees, control the stretch.'],
  ['Push-Up','Chest','Bodyweight','Straight line head to heels, chest to floor.'],
  ['Dip','Chest','Bodyweight','Lean slightly forward, control depth.'],
  ['Lat Pulldown','Back','Cable','Chest tall, elbows drive down and back.'],
  ['Seated Cable Row','Back','Cable','Tall chest, pull elbows past torso.'],
  ['Face Pull','Shoulders','Cable','Elbows high, externally rotate at the end.'],
  ['Lateral Raise','Shoulders','Dumbbell','Slight lean, lead with elbows, stop at shoulder height.'],
  ['Bicep Curl','Arms','Dumbbell','Elbows pinned, no swing.'],
  ['Hammer Curl','Arms','Dumbbell','Neutral grip, slow lowering.'],
  ['Tricep Pushdown','Arms','Cable','Elbows pinned, full lockout.'],
  ['Overhead Tricep Extension','Arms','Dumbbell','Elbows still, stretch then extend.'],
  ['Plank','Core','Bodyweight','Ribs down, glutes tight, breathe.'],
  ['Hanging Leg Raise','Core','Bodyweight','No swing, posterior tilt at the top.'],
  ['Cable Crunch','Core','Cable','Curl ribs to hips, no hip flexor pull.'],
  ['Hip Thrust','Legs','Barbell','Chin tucked, full glute squeeze at top.'],
  ['Walking Lunge','Legs','Dumbbell','Long step, torso tall, soft knee landing.'],
  ['Goblet Squat','Legs','Dumbbell','Elbows inside knees, tall chest.'],
  ['Kettlebell Swing','Full Body','Kettlebell','Hinge, snap hips, bell floats — arms are hooks.'],
  ['Treadmill Run','Cardio','Machine','Warm up, then hold a pace you can repeat.'],
  ['Rowing Machine','Cardio','Machine','Legs, then body, then arms — reverse on return.'],
  ['Assault Bike','Cardio','Machine','Steady pace or intervals, full range.'],
];

function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'workout-tracker.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // Migration for databases created before superset groups existed
  const cols = db.prepare('PRAGMA table_info(routine_exercises)').all().map((c) => c.name);
  if (!cols.includes('superset_group')) db.exec('ALTER TABLE routine_exercises ADD COLUMN superset_group INTEGER');
  const insert = db.prepare('INSERT OR IGNORE INTO exercises (name, muscle, equipment, instructions) VALUES (?,?,?,?)');
  for (const e of EXERCISES) insert.run(...e);
  return db;
}

function createStore(db) {
  return {
    db,
    createUser: (name, email, hash, role, invite) =>
      db.prepare('INSERT INTO users (name,email,password_hash,role,invite_code) VALUES (?,?,?,?,?)').run(name, email, hash, role, invite),
    getUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()),
    getUserById: (id) => db.prepare('SELECT id,name,email,role,invite_code,created_at FROM users WHERE id = ?').get(id),
    getUserByInvite: (code) => db.prepare('SELECT * FROM users WHERE invite_code = ? AND role = ?').get(code, 'trainer'),
    createSession: (tokenHash, userId, expires) => db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash, userId, expires),
    getSessionUser: (tokenHash) => db.prepare("SELECT u.id,u.name,u.email,u.role,u.invite_code FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')").get(tokenHash),
    deleteSession: (tokenHash) => db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash),
    linkClient: (trainerId, clientId) => db.prepare("INSERT OR IGNORE INTO trainer_clients VALUES (?,?,datetime('now'))").run(trainerId, clientId),
    isLinked: (trainerId, clientId) => !!db.prepare('SELECT 1 FROM trainer_clients WHERE trainer_id=? AND client_id=?').get(trainerId, clientId),
    trainerClients: (trainerId) => db.prepare('SELECT u.id,u.name,u.email FROM trainer_clients tc JOIN users u ON u.id=tc.client_id WHERE tc.trainer_id=? ORDER BY u.name').all(trainerId),
    myTrainers: (clientId) => db.prepare('SELECT u.id,u.name,u.email FROM trainer_clients tc JOIN users u ON u.id=tc.trainer_id WHERE tc.client_id=?').all(clientId),
    exercises: () => db.prepare('SELECT * FROM exercises ORDER BY muscle, name').all(),
    getExercise: (id) => db.prepare('SELECT * FROM exercises WHERE id=?').get(id),
    createRoutine: (ownerId, title, notes) => db.prepare('INSERT INTO routines (owner_id,title,notes) VALUES (?,?,?)').run(ownerId, title, notes || ''),
    addRoutineExercise: (routineId, exerciseId, position, sets, reps, weight, rest, supersetGroup) => {
      const g = Number.isInteger(supersetGroup) && supersetGroup >= 1 ? supersetGroup : null;
      return db.prepare('INSERT INTO routine_exercises (routine_id,exercise_id,position,sets,reps,weight,rest_seconds,superset_group) VALUES (?,?,?,?,?,?,?,?)').run(routineId, exerciseId, position, sets, reps, weight ?? null, rest ?? 90, g);
    },
    getRoutine: (id) => db.prepare('SELECT * FROM routines WHERE id=?').get(id),
    routineExercises: (id) => db.prepare('SELECT re.*, e.name, e.muscle, e.equipment FROM routine_exercises re JOIN exercises e ON e.id=re.exercise_id WHERE re.routine_id=? ORDER BY re.position').all(id),
    myRoutines: (userId) => db.prepare('SELECT * FROM routines WHERE owner_id=? ORDER BY created_at DESC').all(userId),
    assignedRoutines: (clientId) => db.prepare('SELECT r.*, u.name AS trainer_name FROM assignments a JOIN routines r ON r.id=a.routine_id JOIN users u ON u.id=a.trainer_id WHERE a.client_id=? ORDER BY a.created_at DESC').all(clientId),
    assignRoutine: (routineId, trainerId, clientId) => db.prepare('INSERT OR IGNORE INTO assignments (routine_id,trainer_id,client_id) VALUES (?,?,?)').run(routineId, trainerId, clientId),
    isAssigned: (routineId, clientId) => !!db.prepare('SELECT 1 FROM assignments WHERE routine_id=? AND client_id=?').get(routineId, clientId),
    createWorkout: (userId, routineId, title) => db.prepare('INSERT INTO workouts (user_id,routine_id,title) VALUES (?,?,?)').run(userId, routineId || null, title),
    getWorkout: (id) => db.prepare('SELECT * FROM workouts WHERE id=?').get(id),
    addSet: (workoutId, exerciseId, setIndex, reps, weight, rpe) =>
      db.prepare('INSERT INTO workout_sets (workout_id,exercise_id,set_index,reps,weight,rpe,completed) VALUES (?,?,?,?,?,?,1)').run(workoutId, exerciseId, setIndex, reps ?? null, weight ?? null, rpe ?? null),
    finishWorkout: (id, notes) => db.prepare("UPDATE workouts SET finished_at=datetime('now'), notes=? WHERE id=?").run(notes || '', id),
    workoutSets: (workoutId) => db.prepare('SELECT ws.*, e.name FROM workout_sets ws JOIN exercises e ON e.id=ws.exercise_id WHERE ws.workout_id=? ORDER BY ws.id').all(workoutId),
    userWorkouts: (userId, limit = 50) => db.prepare('SELECT * FROM workouts WHERE user_id=? ORDER BY started_at DESC LIMIT ?').all(userId, limit),
    addFeedback: (trainerId, clientId, workoutId, body) => db.prepare('INSERT INTO feedback (trainer_id,client_id,workout_id,body) VALUES (?,?,?,?)').run(trainerId, clientId, workoutId || null, body),
    feedbackForClient: (clientId) => db.prepare('SELECT f.*, u.name AS trainer_name FROM feedback f JOIN users u ON u.id=f.trainer_id WHERE f.client_id=? ORDER BY f.created_at DESC LIMIT 50').all(clientId),
    addBodyWeight: (userId, date, weight) => db.prepare('INSERT INTO body_weights (user_id,date,weight) VALUES (?,?,?)').run(userId, date, weight),
    bodyWeights: (userId) => db.prepare('SELECT * FROM body_weights WHERE user_id=? ORDER BY date DESC LIMIT 50').all(userId),
    exerciseBest: (userId, exerciseId) => db.prepare('SELECT MAX(weight) AS max_weight, MAX(weight * (1 + reps/30.0)) AS est_1rm FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id WHERE w.user_id=? AND ws.exercise_id=? AND ws.completed=1 AND ws.weight IS NOT NULL').get(userId, exerciseId),
    exerciseHistory: (userId, exerciseId) => db.prepare('SELECT ws.*, w.started_at FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id WHERE w.user_id=? AND ws.exercise_id=? AND ws.completed=1 ORDER BY w.started_at DESC LIMIT 50').all(userId, exerciseId),
    stats: (userId) => {
      const w = db.prepare('SELECT COUNT(*) c, COALESCE(SUM((SELECT COUNT(*) FROM workout_sets WHERE workout_id=workouts.id AND completed=1)),0) sets FROM workouts WHERE user_id=? AND finished_at IS NOT NULL').get(userId);
      const vol = db.prepare('SELECT COALESCE(SUM(reps*weight),0) volume FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id WHERE w.user_id=? AND ws.completed=1').get(userId);
      return { workouts: w.c, sets: w.sets, volume: Math.round(vol.volume || 0) };
    },
  };
}
module.exports = { openDb, createStore };
