const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "rsvp.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  share_token TEXT UNIQUE NOT NULL,
  firstname TEXT,
  email TEXT,
  nombre TEXT,
  empresa TEXT,
  telefono TEXT,
  ine_path TEXT,
  privacy_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | yes | no
  responded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS socios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  nombre TEXT,
  telefono TEXT,
  ine_path TEXT,
  privacy_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
