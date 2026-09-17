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
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const DATA_DIR = process.env.DATA_DIR || __dirname;
const TEMPLATES_DIR = path.join(DATA_DIR, 'uploads', 'templates');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const QUESTIONS_PATH = path.join(__dirname, 'config', 'questions.json');
const FORM_CONFIG_PATH = path.join(DATA_DIR, 'form-config.json');
for (const dir of [TEMPLATES_DIR, GENERATED_DIR]) fs.mkdirSync(dir, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12, sameSite: 'lax' }
}));

function requireAdmin(req,res,next){ if(req.session?.isAdmin) return next(); return res.status(401).json({error:'尚未登入或登入已過期'}); }
function requireStaff(req,res,next){ if(req.session?.employeeId) return next(); return res.status(401).json({error:'請先登入員編帳號'}); }
function legacyToConfig(){
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH,'utf-8'));
  const sectionNames=[...new Set(questions.map(q=>q.section||'其他'))];
  const pages=sectionNames.map((name,i)=>({id:`page_${i+1}`,title:name,description:''}));
  const pageMap=Object.fromEntries(sectionNames.map((name,i)=>[name,pages[i].id]));
  return {title:'社區交接清冊',subtitle:'物業管理部門',pages,questions:questions.map(q=>({...q,pageId:pageMap[q.section||'其他'],group:'填寫資料'}))};
}
function readFormConfig(){
  if(!fs.existsSync(FORM_CONFIG_PATH)){
    const seedPath=path.join(__dirname,'config','form-config.json');
    const initial=fs.existsSync(seedPath)?JSON.parse(fs.readFileSync(seedPath,'utf-8')):legacyToConfig();
    fs.writeFileSync(FORM_CONFIG_PATH,JSON.stringify(initial,null,2),'utf-8');
  }
  return JSON.parse(fs.readFileSync(FORM_CONFIG_PATH,'utf-8'));
}
function writeFormConfig(config){fs.writeFileSync(FORM_CONFIG_PATH,JSON.stringify(config,null,2),'utf-8');}
function readQuestions(){return readFormConfig().questions;}
function cleanData(data){ return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {}; }

// ===== 公開表單設定 =====
app.get('/api/form-config',(req,res)=>res.json(readFormConfig()));

// ===== 員編登入 =====
app.post('/api/staff/login',(req,res)=>{
  const {employeeId,password}=req.body||{};
  const user=db.prepare('SELECT * FROM staff_users WHERE employee_id=?').get(String(employeeId||'').trim());
  if(!user || !user.is_active || !password || !db.verifyPassword(password,user.password_salt,user.password_hash)) return res.status(401).json({error:'員編或密碼錯誤，或帳號已停用'});
  req.session.employeeId=user.employee_id;
  req.session.employeeName=user.name;
  res.json({success:true,user:{employee_id:user.employee_id,name:user.name}});
});
app.post('/api/staff/logout',(req,res)=>{ const keepAdmin=req.session.isAdmin; req.session.employeeId=null; req.session.employeeName=null; if(!keepAdmin) req.session.destroy(()=>res.json({success:true})); else res.json({success:true}); });
app.get('/api/staff/session',(req,res)=>{
  if(!req.session?.employeeId) return res.json({loggedIn:false});
  const u=db.prepare('SELECT employee_id,name,is_active FROM staff_users WHERE employee_id=?').get(req.session.employeeId);
  if(!u || !u.is_active) return res.json({loggedIn:false});
  res.json({loggedIn:true,user:{employee_id:u.employee_id,name:u.name}});
});

// ===== 員工草稿 =====
app.get('/api/staff/drafts',requireStaff,(req,res)=>{
  const rows=db.prepare('SELECT id,created_at,updated_at,current_page,data FROM drafts WHERE employee_id=? ORDER BY updated_at DESC').all(req.session.employeeId);
  res.json(rows.map(r=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,current_page:r.current_page,data:JSON.parse(r.data)})));
});
app.post('/api/staff/drafts',requireStaff,(req,res)=>{
  const now=new Date().toISOString();
  const data=cleanData(req.body?.data);
  const page=Math.max(0,Number(req.body?.current_page)||0);
  const info=db.prepare('INSERT INTO drafts (employee_id,created_at,updated_at,current_page,data) VALUES (?,?,?,?,?)').run(req.session.employeeId,now,now,page,JSON.stringify(data));
  res.json({success:true,id:info.lastInsertRowid,updated_at:now});
});
app.put('/api/staff/drafts/:id',requireStaff,(req,res)=>{
  const id=Number(req.params.id); const draft=db.prepare('SELECT id FROM drafts WHERE id=? AND employee_id=?').get(id,req.session.employeeId);
  if(!draft) return res.status(404).json({error:'找不到這份草稿'});
  const now=new Date().toISOString(); const data=cleanData(req.body?.data); const page=Math.max(0,Number(req.body?.current_page)||0);
  db.prepare('UPDATE drafts SET updated_at=?,current_page=?,data=? WHERE id=? AND employee_id=?').run(now,page,JSON.stringify(data),id,req.session.employeeId);
  res.json({success:true,updated_at:now});
});
app.get('/api/staff/drafts/:id',requireStaff,(req,res)=>{
  const r=db.prepare('SELECT * FROM drafts WHERE id=? AND employee_id=?').get(Number(req.params.id),req.session.employeeId);
  if(!r) return res.status(404).json({error:'找不到這份草稿'});
  res.json({id:r.id,created_at:r.created_at,updated_at:r.updated_at,current_page:r.current_page,data:JSON.parse(r.data)});
});
app.delete('/api/staff/drafts/:id',requireStaff,(req,res)=>{db.prepare('DELETE FROM drafts WHERE id=? AND employee_id=?').run(Number(req.params.id),req.session.employeeId);res.json({success:true});});

// ===== 正式送出：由草稿轉成 submission =====
app.post('/api/staff/drafts/:id/submit',requireStaff,(req,res)=>{
  const draft=db.prepare('SELECT * FROM drafts WHERE id=? AND employee_id=?').get(Number(req.params.id),req.session.employeeId);
  if(!draft) return res.status(404).json({error:'找不到這份草稿'});
  const answers=JSON.parse(draft.data); const questions=readQuestions();
  const missing=questions.filter(q=>q.required&&!String(answers[q.id]??'').trim());
  if(missing.length) return res.status(400).json({error:'有必填欄位未填寫',missing:missing.map(q=>q.label)});
  const now=new Date().toISOString();
  const info=db.prepare('INSERT INTO submissions (created_at,updated_at,employee_id,employee_name,data) VALUES (?,?,?,?,?)').run(now,now,req.session.employeeId,req.session.employeeName,JSON.stringify(answers));
  db.prepare('DELETE FROM drafts WHERE id=? AND employee_id=?').run(draft.id,req.session.employeeId);
  res.json({success:true,id:info.lastInsertRowid});
});

// ===== 舊版公開送出 API：保留相容性，但現在前台改走草稿 =====
app.post('/api/submissions',requireStaff,(req,res)=>{
  const answers=cleanData(req.body); const missing=readQuestions().filter(q=>q.required&&!String(answers[q.id]??'').trim());
  if(missing.length)return res.status(400).json({error:'有必填欄位未填寫',missing:missing.map(q=>q.label)});
  const now=new Date().toISOString(); const info=db.prepare('INSERT INTO submissions (created_at,updated_at,employee_id,employee_name,data) VALUES (?,?,?,?,?)').run(now,now,req.session.employeeId,req.session.employeeName,JSON.stringify(answers));
  res.json({success:true,id:info.lastInsertRowid});
});

// ===== 管理員登入 =====
app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body||{};if(username===ADMIN_USER&&password===ADMIN_PASS){req.session.isAdmin=true;return res.json({success:true});}res.status(401).json({error:'帳號或密碼錯誤'});});
app.post('/api/admin/logout',(req,res)=>{req.session.destroy(()=>res.json({success:true}));});
app.get('/api/admin/session',(req,res)=>res.json({isAdmin:!!req.session?.isAdmin}));

// ===== 後台：填答紀錄 =====
app.get('/api/admin/submissions',requireAdmin,(req,res)=>{
  const rows=db.prepare('SELECT id,created_at,updated_at,employee_id,employee_name,data FROM submissions ORDER BY id DESC').all();
  res.json({submissions:rows.map(r=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,employee_id:r.employee_id||'',employee_name:r.employee_name||'',data:JSON.parse(r.data)})),questions:readQuestions()});
});
app.delete('/api/admin/submissions/:id',requireAdmin,(req,res)=>{db.prepare('DELETE FROM submissions WHERE id=?').run(req.params.id);res.json({success:true});});

// ===== 後台：表單設定 =====
app.get('/api/admin/questions',requireAdmin,(req,res)=>res.json(readQuestions()));
app.put('/api/admin/questions',requireAdmin,(req,res)=>{const list=req.body;if(!Array.isArray(list))return res.status(400).json({error:'格式錯誤'});const config=readFormConfig();config.questions=list;writeFormConfig(config);res.json({success:true});});
app.get('/api/admin/form-config',requireAdmin,(req,res)=>res.json(readFormConfig()));
app.put('/api/admin/form-config',requireAdmin,(req,res)=>{
  const config=req.body;
  if(!config||!Array.isArray(config.pages)||!Array.isArray(config.questions))return res.status(400).json({error:'表單設定格式錯誤'});
  const pageIds=new Set(config.pages.map(p=>p.id)); const ids=config.questions.map(q=>q.id);
  if(new Set(ids).size!==ids.length)return res.status(400).json({error:'欄位代碼不能重複'});
  if(config.questions.some(q=>!pageIds.has(q.pageId)))return res.status(400).json({error:'有題目尚未指定有效頁面'});
  writeFormConfig(config);res.json({success:true});
});

// ===== 後台：人員管理 =====
app.get('/api/admin/staff',requireAdmin,(req,res)=>{
  const rows=db.prepare('SELECT id,employee_id,name,is_active,created_at,updated_at FROM staff_users ORDER BY is_active DESC, employee_id ASC').all();
  res.json(rows);
});
app.post('/api/admin/staff',requireAdmin,(req,res)=>{
  const employeeId=String(req.body?.employee_id||'').trim(); const name=String(req.body?.name||'').trim(); const password=String(req.body?.password||'');
  if(!employeeId||!name||password.length<4)return res.status(400).json({error:'請填寫員編、姓名，且密碼至少 4 碼'});
  if(db.prepare('SELECT id FROM staff_users WHERE employee_id=?').get(employeeId))return res.status(400).json({error:'這個員編已存在'});
  const now=new Date().toISOString(); const p=db.makePassword(password); const info=db.prepare('INSERT INTO staff_users (employee_id,name,password_hash,password_salt,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(employeeId,name,p.hash,p.salt,now,now);
  res.json({success:true,id:info.lastInsertRowid});
});
app.put('/api/admin/staff/:id',requireAdmin,(req,res)=>{
  const id=Number(req.params.id); const user=db.prepare('SELECT * FROM staff_users WHERE id=?').get(id); if(!user)return res.status(404).json({error:'找不到人員'});
  const name=String(req.body?.name||user.name).trim(); const active=req.body?.is_active===undefined?!!user.is_active:!!req.body.is_active; const password=String(req.body?.password||''); const now=new Date().toISOString();
  if(!name)return res.status(400).json({error:'姓名不可空白'});
  if(password){if(password.length<4)return res.status(400).json({error:'新密碼至少 4 碼'});const p=db.makePassword(password);db.prepare('UPDATE staff_users SET name=?,is_active=?,password_hash=?,password_salt=?,updated_at=? WHERE id=?').run(name,active?1:0,p.hash,p.salt,now,id);}else db.prepare('UPDATE staff_users SET name=?,is_active=?,updated_at=? WHERE id=?').run(name,active?1:0,now,id);
  res.json({success:true});
});
app.delete('/api/admin/staff/:id',requireAdmin,(req,res)=>{const id=Number(req.params.id);const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'找不到人員'});db.prepare('DELETE FROM staff_users WHERE id=?').run(id);db.prepare('DELETE FROM drafts WHERE employee_id=?').run(u.employee_id);res.json({success:true});});

// ===== Word 範本 =====
const upload=multer({storage:multer.diskStorage({destination:(req,file,cb)=>cb(null,TEMPLATES_DIR),filename:(req,file,cb)=>cb(null,Date.now()+'-'+file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]/g,'_'))}),fileFilter:(req,file,cb)=>file.originalname.toLowerCase().endsWith('.docx')?cb(null,true):cb(new Error('只允許上傳 .docx 檔案'))});
app.get('/api/admin/templates',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM templates ORDER BY id DESC').all()));
app.post('/api/admin/templates',requireAdmin,upload.single('template'),(req,res)=>{if(!req.file)return res.status(400).json({error:'未收到檔案'});db.prepare('INSERT INTO templates (name,filename,is_active,created_at) VALUES (?,?,0,?)').run(req.body.name||req.file.originalname,req.file.filename,new Date().toISOString());res.json({success:true});});
app.post('/api/admin/templates/:id/activate',requireAdmin,(req,res)=>{db.prepare('UPDATE templates SET is_active=0').run();db.prepare('UPDATE templates SET is_active=1 WHERE id=?').run(req.params.id);res.json({success:true});});
app.delete('/api/admin/templates/:id',requireAdmin,(req,res)=>{const tpl=db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);if(tpl){const p=path.join(TEMPLATES_DIR,tpl.filename);if(fs.existsSync(p))fs.unlinkSync(p);db.prepare('DELETE FROM templates WHERE id=?').run(req.params.id);}res.json({success:true});});
app.get('/api/admin/generate/:submissionId',requireAdmin,(req,res)=>{const submission=db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.submissionId);if(!submission)return res.status(404).json({error:'找不到該筆紀錄'});const template=req.query.templateId?db.prepare('SELECT * FROM templates WHERE id=?').get(req.query.templateId):db.prepare('SELECT * FROM templates WHERE is_active=1').get();if(!template)return res.status(400).json({error:'尚未設定任何 Word 範本，請先到「範本管理」上傳並啟用一份範本'});try{const buffer=generateDocx(path.join(TEMPLATES_DIR,template.filename),JSON.parse(submission.data));const d=JSON.parse(submission.data);const fileName=`交接清冊_${d.community_name||submission.id}_${submission.id}.docx`;res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.send(buffer);}catch(err){console.error(err);res.status(500).json({error:'產生 Word 檔失敗，請確認範本內的 {{欄位代碼}} 是否正確',detail:err.message});}});

app.listen(PORT,()=>console.log(`伺服器已啟動：http://localhost:${PORT}`));
