require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const db = require('./db');
const { generateDocx } = require('./generate');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 簡易管理員帳號（正式上線請改用環境變數，並考慮用資料庫存多組帳號） ----
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const TEMPLATES_DIR = path.join(__dirname, 'uploads', 'templates');
const GENERATED_DIR = path.join(__dirname, 'generated');
const QUESTIONS_PATH = path.join(__dirname, 'config', 'questions.json');

for (const dir of [TEMPLATES_DIR, GENERATED_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 小時
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: '尚未登入或登入已過期' });
}

function readQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
}
function writeQuestions(list) {
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(list, null, 2), 'utf-8');
}

// =====================================================================
// 前台：社區經理填表用
// =====================================================================

// 取得目前的表單題目設定
app.get('/api/questions', (req, res) => {
  res.json(readQuestions());
});

// 送出一筆交接清冊填答
app.post('/api/submissions', (req, res) => {
  const answers = req.body || {};
  const questions = readQuestions();

  // 後端也驗證一次必填欄位，避免繞過前端直接打 API
  const missing = questions.filter((q) => q.required && !String(answers[q.id] ?? '').trim());
  if (missing.length > 0) {
    return res.status(400).json({
      error: '有必填欄位未填寫',
      missing: missing.map((q) => q.label),
    });
  }

  const stmt = db.prepare('INSERT INTO submissions (created_at, data) VALUES (?, ?)');
  const info = stmt.run(new Date().toISOString(), JSON.stringify(answers));

  res.json({ success: true, id: info.lastInsertRowid });
});

// =====================================================================
// 後台登入
// =====================================================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: '帳號或密碼錯誤' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// =====================================================================
// 後台：查看填答紀錄
// =====================================================================

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, created_at, data FROM submissions ORDER BY id DESC').all();
  const questions = readQuestions();
  const result = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    data: JSON.parse(r.data),
  }));
  res.json({ submissions: result, questions });
});

app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =====================================================================
// 後台：表單題目管理（新增/修改/刪除/排序）
// =====================================================================

app.get('/api/admin/questions', requireAdmin, (req, res) => {
  res.json(readQuestions());
});

app.put('/api/admin/questions', requireAdmin, (req, res) => {
  // 直接整批覆蓋，前端會把編輯完整份清單送回來
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: '格式錯誤' });
  writeQuestions(list);
  res.json({ success: true });
});

// =====================================================================
// 後台：Word 範本管理
// =====================================================================

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMPLATES_DIR),
    filename: (req, file, cb) => {
      const safeName = Date.now() + '-' + file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
      cb(null, safeName);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.docx')) {
      return cb(new Error('只允許上傳 .docx 檔案'));
    }
    cb(null, true);
  },
});

app.get('/api/admin/templates', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY id DESC').all();
  res.json(rows);
});

app.post('/api/admin/templates', requireAdmin, upload.single('template'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到檔案' });
  const name = req.body.name || req.file.originalname;
  db.prepare('INSERT INTO templates (name, filename, is_active, created_at) VALUES (?, ?, 0, ?)').run(
    name,
    req.file.filename,
    new Date().toISOString()
  );
  res.json({ success: true });
});

app.post('/api/admin/templates/:id/activate', requireAdmin, (req, res) => {
  db.prepare('UPDATE templates SET is_active = 0').run();
  db.prepare('UPDATE templates SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/templates/:id', requireAdmin, (req, res) => {
  const tpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (tpl) {
    const filePath = path.join(TEMPLATES_DIR, tpl.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

// =====================================================================
// 後台：將某一筆填答資料，套用範本產生 Word 檔並下載
// =====================================================================

app.get('/api/admin/generate/:submissionId', requireAdmin, (req, res) => {
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.submissionId);
  if (!submission) return res.status(404).json({ error: '找不到該筆紀錄' });

  const templateId = req.query.templateId;
  const template = templateId
    ? db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId)
    : db.prepare('SELECT * FROM templates WHERE is_active = 1').get();

  if (!template) {
    return res.status(400).json({ error: '尚未設定任何 Word 範本，請先到「範本管理」上傳並啟用一份範本' });
  }

  const templatePath = path.join(TEMPLATES_DIR, template.filename);
  const data = JSON.parse(submission.data);

  try {
    const buffer = generateDocx(templatePath, data);
    const fileName = `交接清冊_${data.community_name || submission.id}_${submission.id}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '產生 Word 檔失敗，請確認範本內的 {{欄位代碼}} 是否正確', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`伺服器已啟動： http://localhost:${PORT}`);
  console.log(`後台管理： http://localhost:${PORT}/admin.html`);
});
