const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    current_page INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    UNIQUE(employee_id, id)
  );
`);

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumnIfMissing('submissions', 'employee_id', "TEXT DEFAULT ''");
addColumnIfMissing('submissions', 'employee_name', "TEXT DEFAULT ''");
addColumnIfMissing('submissions', 'updated_at', "TEXT DEFAULT ''");

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}
function createStaff(employeeId, name, password) {
  const now = new Date().toISOString();
  const { salt, hash } = makePassword(password);
  const info = db.prepare(`INSERT INTO staff_users (employee_id,name,password_hash,password_salt,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`).run(employeeId.trim(), name.trim(), hash, salt, now, now);
  return info.lastInsertRowid;
}
function ensureDefaultStaff() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM staff_users').get().c;
  if (count === 0) {
    const employeeId = process.env.DEFAULT_EMPLOYEE_ID || 'A001';
    const password = process.env.DEFAULT_EMPLOYEE_PASS || '1234';
    const name = process.env.DEFAULT_EMPLOYEE_NAME || '測試人員';
    createStaff(employeeId, name, password);
    console.log(`已建立初始填表人員：${employeeId}（請登入後由管理員修改密碼）`);
  }
}
ensureDefaultStaff();

module.exports = db;
module.exports.makePassword = makePassword;
module.exports.verifyPassword = verifyPassword;
