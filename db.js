const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'data.sqlite'));
db.pragma('foreign_keys = ON');

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
    data TEXT NOT NULL
  );
`);

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// V3 compatibility columns
addColumnIfMissing('submissions', 'employee_id', "TEXT DEFAULT ''");
addColumnIfMissing('submissions', 'employee_name', "TEXT DEFAULT ''");
addColumnIfMissing('submissions', 'updated_at', "TEXT DEFAULT ''");

// V4 multi-tenant / RBAC columns
addColumnIfMissing('staff_users', 'role', "TEXT DEFAULT 'staff'");
addColumnIfMissing('staff_users', 'tenant_id', "INTEGER");
addColumnIfMissing('staff_users', 'last_login_at', "TEXT DEFAULT ''");
addColumnIfMissing('submissions', 'tenant_id', "INTEGER");
addColumnIfMissing('submissions', 'community_id', "INTEGER");
addColumnIfMissing('drafts', 'tenant_id', "INTEGER");
addColumnIfMissing('drafts', 'community_id', "INTEGER");
addColumnIfMissing('templates', 'tenant_id', "INTEGER");

// New tenant tables

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS communities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );
  CREATE TABLE IF NOT EXISTS staff_communities (
    staff_id INTEGER NOT NULL,
    community_id INTEGER NOT NULL,
    PRIMARY KEY (staff_id, community_id),
    FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
  );
`);

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  try {
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}

function createStaff(employeeId, name, password, role='staff', tenantId=null) {
  const now = new Date().toISOString();
  const { salt, hash } = makePassword(password);
  const info = db.prepare(`INSERT INTO staff_users (employee_id,name,password_hash,password_salt,is_active,created_at,updated_at,role,tenant_id) VALUES (?,?,?,?,1,?,?,?,?,?)`)
    .run(employeeId.trim(), name.trim(), hash, salt, now, now, role, tenantId);
  return info.lastInsertRowid;
}

function slugCode(name) {
  const base = String(name || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
  let code = base, n = 2;
  while (db.prepare('SELECT id FROM tenants WHERE code=?').get(code)) code = `${base}-${n++}`;
  return code;
}

function ensureTenant() {
  let tenant = db.prepare('SELECT * FROM tenants ORDER BY id LIMIT 1').get();
  if (!tenant) {
    const now = new Date().toISOString();
    const name = process.env.DEFAULT_TENANT_NAME || '示範物業管理公司';
    const code = process.env.DEFAULT_TENANT_CODE || slugCode(name);
    const info = db.prepare('INSERT INTO tenants (name,code,status,created_at,updated_at) VALUES (?,?,?,?,?)').run(name, code, 'active', now, now);
    tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(info.lastInsertRowid);
  }
  return tenant;
}

const defaultTenant = ensureTenant();

// Migrate all V3 staff/drafts/submissions/templates into the first tenant.
db.prepare("UPDATE staff_users SET tenant_id=? WHERE tenant_id IS NULL").run(defaultTenant.id);
db.prepare("UPDATE submissions SET tenant_id=(SELECT tenant_id FROM staff_users WHERE staff_users.employee_id=submissions.employee_id) WHERE tenant_id IS NULL").run();
db.prepare("UPDATE submissions SET tenant_id=? WHERE tenant_id IS NULL").run(defaultTenant.id);
db.prepare("UPDATE drafts SET tenant_id=(SELECT tenant_id FROM staff_users WHERE staff_users.employee_id=drafts.employee_id) WHERE tenant_id IS NULL").run();
db.prepare("UPDATE drafts SET tenant_id=? WHERE tenant_id IS NULL").run(defaultTenant.id);
db.prepare("UPDATE templates SET tenant_id=? WHERE tenant_id IS NULL").run(defaultTenant.id);

function ensureDefaultCommunity() {
  let c = db.prepare('SELECT * FROM communities WHERE tenant_id=? ORDER BY id LIMIT 1').get(defaultTenant.id);
  if (!c) {
    const now = new Date().toISOString();
    const info = db.prepare('INSERT INTO communities (tenant_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?)').run(defaultTenant.id, '示範社區', 'active', now, now);
    c = db.prepare('SELECT * FROM communities WHERE id=?').get(info.lastInsertRowid);
  }
  return c;
}
const defaultCommunity = ensureDefaultCommunity();

function ensureDefaultStaff() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM staff_users').get().c;
  if (count === 0) {
    const employeeId = process.env.DEFAULT_EMPLOYEE_ID || 'A001';
    const password = process.env.DEFAULT_EMPLOYEE_PASS || '1234';
    const name = process.env.DEFAULT_EMPLOYEE_NAME || '測試人員';
    const id = createStaff(employeeId, name, password, 'staff', defaultTenant.id);
    db.prepare('INSERT OR IGNORE INTO staff_communities (staff_id,community_id) VALUES (?,?)').run(id, defaultCommunity.id);
    console.log(`已建立初始填表人員：${employeeId}`);
  }
  const companyAdminCount = db.prepare("SELECT COUNT(*) AS c FROM staff_users WHERE role='company_admin'").get().c;
  if (companyAdminCount === 0) {
    const employeeId = process.env.DEFAULT_COMPANY_ADMIN_ID || 'CA001';
    const password = process.env.DEFAULT_COMPANY_ADMIN_PASS || '1234';
    const name = process.env.DEFAULT_COMPANY_ADMIN_NAME || '示範公司管理員';
    if (!db.prepare('SELECT id FROM staff_users WHERE employee_id=?').get(employeeId)) {
      createStaff(employeeId, name, password, 'company_admin', defaultTenant.id);
      console.log(`已建立示範公司管理員：${employeeId}`);
    }
  }
}
ensureDefaultStaff();
// Existing V3 staff get the default community until the company manager customizes access.
const unassignedStaff = db.prepare('SELECT u.id FROM staff_users u LEFT JOIN staff_communities sc ON sc.staff_id=u.id WHERE u.tenant_id=? GROUP BY u.id HAVING COUNT(sc.community_id)=0').all(defaultTenant.id);
const assignDefault = db.prepare('INSERT OR IGNORE INTO staff_communities (staff_id,community_id) VALUES (?,?)');
for (const u of unassignedStaff) assignDefault.run(u.id, defaultCommunity.id);

module.exports = db;
module.exports.makePassword = makePassword;
module.exports.verifyPassword = verifyPassword;
