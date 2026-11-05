// Backup the workout-tracker database while the server is running.
// Uses SQLite's online backup API, so no downtime and no half-copied WAL.
// Usage: node scripts/backup.js [output-path]
//   Default: backups/workout-tracker-YYYY-MM-DD-HHmmss.db
//   Reads WORKOUT_DATA_DIR, same as server.js.
// Restore: stop the server, replace data/workout-tracker.db with the backup
//   (delete the -wal and -shm files too), start the server.
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function backup(dataDir, dest) {
  const src = path.join(dataDir, 'workout-tracker.db');
  if (!fs.existsSync(src)) throw new Error(`No database found at ${src} — is the server running or has it run once?`);
  const out = dest || path.join(__dirname, '..', 'backups', `workout-tracker-${timestamp()}.db`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const db = new Database(src, { readonly: true });
  try {
    await db.backup(out);
  } finally {
    db.close();
  }
  return out;
}

if (require.main === module) {
  const dataDir = process.env.WORKOUT_DATA_DIR || path.join(__dirname, '..', 'data');
  backup(dataDir, process.argv[2])
    .then((out) => console.log(`Backup written to ${out}`))
    .catch((e) => { console.error(`Backup failed: ${e.message}`); process.exit(1); });
}
module.exports = { backup };
