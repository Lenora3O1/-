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

// 與 db.js 使用同一個 DATA_DIR，確保範本檔和資料庫存在同一個「永久保存資料夾」裡。
const DATA_DIR = process.env.DATA_DIR || __dirname;
const TEMPLATES_DIR = path.join(DATA_DIR, 'uploads', 'templates');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const QUESTIONS_PATH = path.join(__dirname, 'config', 'questions.json');
const FORM_CONFIG_PATH = path.join(DATA_DIR, 'form-config.json');

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

function legacyToConfig() {
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
  const sectionNames = [...new Set(questions.map(q => q.section || '其他'))];
  const pages = sectionNames.map((name, i) => ({ id: `page_${i + 1}`, title: name, description: '' }));
  const pageMap = Object.fromEntries(sectionNames.map((name, i) => [name, pages[i].id]));
  return { title: '社區交接清冊', subtitle: '物業管理部門', pages, questions: questions.map(q => ({ ...q, pageId: pageMap[q.section || '其他'], group: '填寫資料' })) };
}
function readFormConfig() {
  if (!fs.existsSync(FORM_CONFIG_PATH)) {
    // 第一次啟動：優先使用專案附帶的「新手友善」初始設定，並複製到 /data 保存。
    const seedPath = path.join(__dirname, 'config', 'form-config.json');
    const initial = fs.existsSync(seedPath)
      ? JSON.parse(fs.readFileSync(seedPath, 'utf-8'))
      : legacyToConfig();
    fs.writeFileSync(FORM_CONFIG_PATH, JSON.stringify(initial, null, 2), 'utf-8');
  }
  return normalizeFormConfig(JSON.parse(fs.readFileSync(FORM_CONFIG_PATH, 'utf-8')));
}
function normalizeFormConfig(config) {
  if (!config || !Array.isArray(config.pages)) return config;
  config.pages.forEach((p) => {
    if (!Array.isArray(p.groups)) p.groups = [];
    const seen = new Set();
    p.groups = p.groups.map(g => String(g || '').trim()).filter(g => g && !seen.has(g) && (seen.add(g), true));
    (config.questions || []).filter(q => q.pageId === p.id).forEach(q => {
      const g = String(q.group || '填寫資料').trim() || '填寫資料';
      if (!seen.has(g)) { seen.add(g); p.groups.push(g); }
    });
    if (!p.groups.length) p.groups.push('填寫資料');
  });
  const pageOrder = new Map(config.pages.map((p, i) => [p.id, i]));
  const groupOrder = new Map();
  config.pages.forEach(p => p.groups.forEach((g, i) => groupOrder.set(`${p.id}||${g}`, i)));
  config.questions = (config.questions || []).map((q, i) => ({...q, __oldOrder: i}));
  config.questions.sort((a,b) => {
    const pa = pageOrder.has(a.pageId) ? pageOrder.get(a.pageId) : 9999;
    const pb = pageOrder.has(b.pageId) ? pageOrder.get(b.pageId) : 9999;
    if (pa !== pb) return pa - pb;
    const ga = String(a.group || '填寫資料').trim() || '填寫資料';
    const gb = String(b.group || '填寫資料').trim() || '填寫資料';
    const oa = groupOrder.get(`${a.pageId}||${ga}`) ?? 9999;
    const ob = groupOrder.get(`${b.pageId}||${gb}`) ?? 9999;
    if (oa !== ob) return oa - ob;
    return a.__oldOrder - b.__oldOrder;
  });
  config.questions.forEach(q => delete q.__oldOrder);
  return config;
}
function writeFormConfig(config) {
  fs.writeFileSync(FORM_CONFIG_PATH, JSON.stringify(normalizeFormConfig(config), null, 2), 'utf-8');
}
function readQuestions() { return readFormConfig().questions; }

// =====================================================================
// 前台：社區經理填表用
// =====================================================================

// 取得目前的表單題目設定
app.get('/api/questions', (req, res) => { res.json(readQuestions()); });

app.get('/api/form-config', (req, res) => { res.json(readFormConfig()); });

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

app.get('/api/admin/questions', requireAdmin, (req, res) => { res.json(readQuestions()); });

app.put('/api/admin/questions', requireAdmin, (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: '格式錯誤' });
  const config = readFormConfig(); config.questions = list; writeFormConfig(config);
  res.json({ success: true });
});

app.get('/api/admin/form-config', requireAdmin, (req, res) => { res.json(readFormConfig()); });

app.put('/api/admin/form-config', requireAdmin, (req, res) => {
  const config = req.body;
  if (!config || !Array.isArray(config.pages) || !Array.isArray(config.questions)) return res.status(400).json({ error: '表單設定格式錯誤' });
  const pageIds = new Set(config.pages.map(p => p.id));
  const questionIds = config.questions.map(q => q.id);
  if (new Set(questionIds).size !== questionIds.length) return res.status(400).json({ error: '欄位代碼不能重複' });
  if (config.questions.some(q => !pageIds.has(q.pageId))) return res.status(400).json({ error: '有題目尚未指定有效頁面' });
  writeFormConfig(config); res.json({ success: true });
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
