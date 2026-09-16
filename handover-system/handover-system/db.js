const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL          -- JSON 字串，存放所有題目的回答 { questionId: answer }
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,     -- 實際存在 uploads/templates 底下的檔名
    is_active INTEGER DEFAULT 0,-- 1 表示是目前預設使用的範本
    created_at TEXT NOT NULL
  );
`);

module.exports = db;
