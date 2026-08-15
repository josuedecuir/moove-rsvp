const session = require("express-session");
const db = require("./db");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires INTEGER,
    data TEXT NOT NULL
  )
`);

const getStmt = db.prepare("SELECT data, expires FROM sessions WHERE sid = ?");
const upsertStmt = db.prepare(`
  INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?)
  ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data
`);
const destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
const pruneStmt = db.prepare("DELETE FROM sessions WHERE expires IS NOT NULL AND expires < ?");

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Store de sesiones sobre el mismo SQLite del Volume — sobrevive a redeploys
// y no acumula memoria en el proceso, a diferencia del MemoryStore default.
class SqliteSessionStore extends session.Store {
  get(sid, cb) {
    try {
      pruneStmt.run(Date.now());
      const row = getStmt.get(sid);
      if (!row) return cb(null, null);
      if (row.expires && row.expires < Date.now()) {
        destroyStmt.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge;
      const expires = Date.now() + (typeof maxAge === "number" ? maxAge : DEFAULT_TTL_MS);
      upsertStmt.run(sid, expires, JSON.stringify(sessionData));
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      destroyStmt.run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sessionData, cb) {
    this.set(sid, sessionData, cb);
  }
}

module.exports = SqliteSessionStore;
