const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// DATA_DIR 可透過環境變數指定「永久保存資料」的資料夾位置。
// 本機開發沒設定的話，預設存在專案資料夾底下。
// 部署到雲端平台（如 Zeabur）時，請把 DATA_DIR 設成掛載了 Volume（永久硬碟）的路徑，
// 例如 /data，這樣重新部署或重開機時，資料庫內容才不會不見。
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'data.sqlite'));

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
