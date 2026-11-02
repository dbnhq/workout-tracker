const crypto = require('crypto');

// scrypt password hashing, no extra dependency. Stored as scrypt:<salt>:<hash>
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [, salt, hash] = stored.split(':');
    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch { return false; }
}
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function newInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}
module.exports = { hashPassword, verifyPassword, newToken, hashToken, newInviteCode };
