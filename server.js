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
  cookie: { maxAge: 1000 * 60 * 60 * 12, sameSite: 'lax', httpOnly: true }
}));

function requireSuperAdmin(req,res,next){ if(req.session?.isAdmin) return next(); return res.status(401).json({error:'尚未登入總後臺或登入已過期'}); }
function requireStaff(req,res,next){ if(req.session?.employeeId && req.session?.tenantId) return next(); return res.status(401).json({error:'請先登入員編帳號'}); }
function requireCompanyAdmin(req,res,next){ if(req.session?.employeeId && req.session?.tenantId && req.session?.role==='company_admin') return next(); return res.status(403).json({error:'只有公司管理員可以使用這個後臺'}); }
function tenantId(req){ return Number(req.session.tenantId); }
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
function now(){return new Date().toISOString();}
function getUser(req){ return req.session?.employeeId ? db.prepare(`SELECT * FROM staff_users WHERE employee_id=?`).get(req.session.employeeId) : null; }
function getAccessibleCommunity(req, id){
  const cid=Number(id);
  if(!cid) return null;
  const u=getUser(req);
  if(!u || u.tenant_id!==tenantId(req)) return null;
  if(u.role==='company_admin') return db.prepare('SELECT * FROM communities WHERE id=? AND tenant_id=? AND status=\'active\'').get(cid,tenantId(req));
  return db.prepare(`SELECT c.* FROM communities c JOIN staff_communities sc ON sc.community_id=c.id WHERE c.id=? AND c.tenant_id=? AND c.status='active' AND sc.staff_id=?`).get(cid,tenantId(req),u.id);
}
function getTenant(req){return db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId(req));}

// ===== 公開表單設定（所有公司共用中央表單版本；後續可再擴充公司覆寫） =====
app.get('/api/form-config',(req,res)=>res.json(readFormConfig()));

// ===== 員編登入 / 登出 =====
app.post('/api/staff/login',(req,res)=>{
  const {employeeId,password}=req.body||{};
  const user=db.prepare('SELECT * FROM staff_users WHERE employee_id=?').get(String(employeeId||'').trim());
  const tenant=user?.tenant_id ? db.prepare('SELECT * FROM tenants WHERE id=?').get(user.tenant_id) : null;
  if(!user || !user.is_active || !tenant || tenant.status!=='active' || !password || !db.verifyPassword(password,user.password_salt,user.password_hash)) return res.status(401).json({error:'員編或密碼錯誤，或帳號已停用'});
  req.session.employeeId=user.employee_id; req.session.employeeName=user.name; req.session.tenantId=user.tenant_id; req.session.role=user.role||'staff';
  db.prepare('UPDATE staff_users SET last_login_at=? WHERE id=?').run(now(),user.id);
  res.json({success:true,user:{employee_id:user.employee_id,name:user.name,role:user.role||'staff',tenant_id:user.tenant_id,tenant_name:tenant.name}});
});
app.post('/api/staff/logout',(req,res)=>{req.session.destroy(()=>res.json({success:true}));});
app.get('/api/staff/session',(req,res)=>{
  const u=getUser(req); if(!u || !u.is_active || !u.tenant_id) return res.json({loggedIn:false});
  const t=db.prepare('SELECT * FROM tenants WHERE id=?').get(u.tenant_id); if(!t || t.status!=='active') return res.json({loggedIn:false});
  res.json({loggedIn:true,user:{employee_id:u.employee_id,name:u.name,role:u.role||'staff',tenant_id:u.tenant_id,tenant_name:t.name}});
});

// ===== 公司/社區資訊給前台 =====
app.get('/api/staff/tenant',requireStaff,(req,res)=>res.json({tenant:getTenant(req)}));
app.get('/api/staff/communities',requireStaff,(req,res)=>{
  const u=getUser(req); let rows;
  if(u.role==='company_admin') rows=db.prepare("SELECT * FROM communities WHERE tenant_id=? AND status='active' ORDER BY name").all(tenantId(req));
  else rows=db.prepare("SELECT c.* FROM communities c JOIN staff_communities sc ON sc.community_id=c.id WHERE c.tenant_id=? AND c.status='active' AND sc.staff_id=? ORDER BY c.name").all(tenantId(req),u.id);
  res.json(rows);
});

// ===== 員工草稿 =====
app.get('/api/staff/drafts',requireStaff,(req,res)=>{
  const rows=db.prepare('SELECT id,created_at,updated_at,current_page,data,community_id FROM drafts WHERE employee_id=? AND tenant_id=? ORDER BY updated_at DESC').all(req.session.employeeId,tenantId(req));
  res.json(rows.map(r=>({id:r.id,created_at:r.created_at,updated_at:r.updated_at,current_page:r.current_page,community_id:r.community_id,data:JSON.parse(r.data)})));
});
app.post('/api/staff/drafts',requireStaff,(req,res)=>{
  const data=cleanData(req.body?.data); const page=Math.max(0,Number(req.body?.current_page)||0); const communityId=req.body?.community_id?Number(req.body.community_id):null;
  if(communityId && !getAccessibleCommunity(req,communityId)) return res.status(403).json({error:'您沒有這個社區的填寫權限'});
  const t=now(); const info=db.prepare('INSERT INTO drafts (employee_id,tenant_id,community_id,created_at,updated_at,current_page,data) VALUES (?,?,?,?,?,?,?)').run(req.session.employeeId,tenantId(req),communityId,t,t,page,JSON.stringify(data));
  res.json({success:true,id:info.lastInsertRowid,updated_at:t});
});
app.put('/api/staff/drafts/:id',requireStaff,(req,res)=>{
  const id=Number(req.params.id); const draft=db.prepare('SELECT * FROM drafts WHERE id=? AND employee_id=? AND tenant_id=?').get(id,req.session.employeeId,tenantId(req));
  if(!draft) return res.status(404).json({error:'找不到這份草稿'});
  const data=cleanData(req.body?.data); const page=Math.max(0,Number(req.body?.current_page)||0); const communityId=req.body?.community_id===undefined?draft.community_id:(req.body.community_id?Number(req.body.community_id):null);
  if(communityId && !getAccessibleCommunity(req,communityId)) return res.status(403).json({error:'您沒有這個社區的填寫權限'});
  const t=now(); db.prepare('UPDATE drafts SET updated_at=?,current_page=?,data=?,community_id=? WHERE id=? AND employee_id=? AND tenant_id=?').run(t,page,JSON.stringify(data),communityId,id,req.session.employeeId,tenantId(req));
  res.json({success:true,updated_at:t});
});
app.get('/api/staff/drafts/:id',requireStaff,(req,res)=>{
  const r=db.prepare('SELECT * FROM drafts WHERE id=? AND employee_id=? AND tenant_id=?').get(Number(req.params.id),req.session.employeeId,tenantId(req));
  if(!r) return res.status(404).json({error:'找不到這份草稿'});
  res.json({id:r.id,created_at:r.created_at,updated_at:r.updated_at,current_page:r.current_page,community_id:r.community_id,data:JSON.parse(r.data)});
});
app.delete('/api/staff/drafts/:id',requireStaff,(req,res)=>{db.prepare('DELETE FROM drafts WHERE id=? AND employee_id=? AND tenant_id=?').run(Number(req.params.id),req.session.employeeId,tenantId(req));res.json({success:true});});
app.post('/api/staff/drafts/:id/submit',requireStaff,(req,res)=>{
  const draft=db.prepare('SELECT * FROM drafts WHERE id=? AND employee_id=? AND tenant_id=?').get(Number(req.params.id),req.session.employeeId,tenantId(req));
  if(!draft) return res.status(404).json({error:'找不到這份草稿'});
  const answers=JSON.parse(draft.data); const questions=readQuestions(); const missing=questions.filter(q=>q.required&&!String(answers[q.id]??'').trim());
  if(missing.length) return res.status(400).json({error:'有必填欄位未填寫',missing:missing.map(q=>q.label)});
  const t=now(); const info=db.prepare('INSERT INTO submissions (created_at,updated_at,employee_id,employee_name,tenant_id,community_id,data) VALUES (?,?,?,?,?,?,?)').run(t,t,req.session.employeeId,req.session.employeeName,tenantId(req),draft.community_id,JSON.stringify(answers));
  db.prepare('DELETE FROM drafts WHERE id=? AND employee_id=? AND tenant_id=?').run(draft.id,req.session.employeeId,tenantId(req));
  res.json({success:true,id:info.lastInsertRowid});
});
app.post('/api/submissions',requireStaff,(req,res)=>{
  const answers=cleanData(req.body); const missing=readQuestions().filter(q=>q.required&&!String(answers[q.id]??'').trim());
  if(missing.length)return res.status(400).json({error:'有必填欄位未填寫',missing:missing.map(q=>q.label)});
  const t=now(); const info=db.prepare('INSERT INTO submissions (created_at,updated_at,employee_id,employee_name,tenant_id,data) VALUES (?,?,?,?,?,?)').run(t,t,req.session.employeeId,req.session.employeeName,tenantId(req),JSON.stringify(answers));
  res.json({success:true,id:info.lastInsertRowid});
});

// ===== 總後臺 =====
app.post('/api/admin/login',(req,res)=>{const {username,password}=req.body||{};if(username===ADMIN_USER&&password===ADMIN_PASS){req.session.isAdmin=true;req.session.employeeId=null;req.session.tenantId=null;req.session.role='super_admin';return res.json({success:true});}res.status(401).json({error:'帳號或密碼錯誤'});});
app.post('/api/admin/logout',(req,res)=>{req.session.destroy(()=>res.json({success:true}));});
app.get('/api/admin/session',(req,res)=>res.json({isAdmin:!!req.session?.isAdmin}));

app.get('/api/admin/tenants',requireSuperAdmin,(req,res)=>{
  const rows=db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM staff_users u WHERE u.tenant_id=t.id) staff_count, (SELECT COUNT(*) FROM communities c WHERE c.tenant_id=t.id) community_count FROM tenants t ORDER BY t.id DESC`).all();
  res.json(rows);
});
app.post('/api/admin/tenants',requireSuperAdmin,(req,res)=>{
  const name=String(req.body?.name||'').trim(); const code=String(req.body?.code||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'-');
  const adminEmployeeId=String(req.body?.admin_employee_id||'').trim(); const adminName=String(req.body?.admin_name||'').trim(); const adminPassword=String(req.body?.admin_password||'');
  if(!name||!adminEmployeeId||!adminName||adminPassword.length<4)return res.status(400).json({error:'請完整填寫公司名稱、公司管理員員編、姓名與至少 4 碼密碼'});
  if(db.prepare('SELECT id FROM staff_users WHERE employee_id=?').get(adminEmployeeId))return res.status(400).json({error:'公司管理員員編已存在'});
  if(code && db.prepare('SELECT id FROM tenants WHERE code=?').get(code))return res.status(400).json({error:'公司代碼已存在'});
  const finalCode=code||`company-${Date.now()}`; const t=now(); const tx=db.transaction(()=>{
    const info=db.prepare('INSERT INTO tenants (name,code,status,created_at,updated_at) VALUES (?,?,?,?,?)').run(name,finalCode,'active',t,t);
    const tid=info.lastInsertRowid; const p=db.makePassword(adminPassword); const u=db.prepare('INSERT INTO staff_users (employee_id,name,password_hash,password_salt,is_active,created_at,updated_at,role,tenant_id) VALUES (?,?,?,?,1,?,?,?,?,?)').run(adminEmployeeId,adminName,p.hash,p.salt,t,t,'company_admin',tid);
    db.prepare('INSERT INTO communities (tenant_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?)').run(tid,'請建立第一個社區','active',t,t);
    return {tenantId:tid,userId:u.lastInsertRowid};
  });
  try{res.json({success:true,...tx()});}catch(e){res.status(500).json({error:'建立公司失敗，請確認資料是否重複'});}
});
app.put('/api/admin/tenants/:id',requireSuperAdmin,(req,res)=>{const id=Number(req.params.id);const t=db.prepare('SELECT * FROM tenants WHERE id=?').get(id);if(!t)return res.status(404).json({error:'找不到公司'});const name=String(req.body?.name||t.name).trim();const status=req.body?.status===undefined?t.status:(req.body.status?'active':'inactive');if(!name)return res.status(400).json({error:'公司名稱不可空白'});db.prepare('UPDATE tenants SET name=?,status=?,updated_at=? WHERE id=?').run(name,status,now(),id);res.json({success:true});});

app.get('/api/admin/submissions',requireSuperAdmin,(req,res)=>{
  const rows=db.prepare(`SELECT s.id,s.created_at,s.updated_at,s.employee_id,s.employee_name,s.tenant_id,s.community_id,s.data,t.name tenant_name,c.name community_name FROM submissions s LEFT JOIN tenants t ON t.id=s.tenant_id LEFT JOIN communities c ON c.id=s.community_id ORDER BY s.id DESC`).all();
  res.json({submissions:rows.map(r=>({...r,data:JSON.parse(r.data)})),questions:readQuestions()});
});
app.delete('/api/admin/submissions/:id',requireSuperAdmin,(req,res)=>{db.prepare('DELETE FROM submissions WHERE id=?').run(req.params.id);res.json({success:true});});
app.get('/api/admin/questions',requireSuperAdmin,(req,res)=>res.json(readQuestions()));
app.put('/api/admin/questions',requireSuperAdmin,(req,res)=>{const list=req.body;if(!Array.isArray(list))return res.status(400).json({error:'格式錯誤'});const config=readFormConfig();config.questions=list;writeFormConfig(config);res.json({success:true});});
app.get('/api/admin/form-config',requireSuperAdmin,(req,res)=>res.json(readFormConfig()));
app.put('/api/admin/form-config',requireSuperAdmin,(req,res)=>{const config=req.body;if(!config||!Array.isArray(config.pages)||!Array.isArray(config.questions))return res.status(400).json({error:'表單設定格式錯誤'});const pageIds=new Set(config.pages.map(p=>p.id));const ids=config.questions.map(q=>q.id);if(new Set(ids).size!==ids.length)return res.status(400).json({error:'欄位代碼不能重複'});if(config.questions.some(q=>!pageIds.has(q.pageId)))return res.status(400).json({error:'有題目尚未指定有效頁面'});writeFormConfig(config);res.json({success:true});});

// 總後臺可查看全部帳號，但一般公司管理操作應在公司後台進行
app.get('/api/admin/staff',requireSuperAdmin,(req,res)=>{const rows=db.prepare(`SELECT u.id,u.employee_id,u.name,u.is_active,u.role,u.tenant_id,u.created_at,u.updated_at,t.name tenant_name FROM staff_users u LEFT JOIN tenants t ON t.id=u.tenant_id ORDER BY u.tenant_id,u.role DESC,u.employee_id`).all();res.json(rows);});
app.put('/api/admin/staff/:id',requireSuperAdmin,(req,res)=>{const id=Number(req.params.id);const user=db.prepare('SELECT * FROM staff_users WHERE id=?').get(id);if(!user)return res.status(404).json({error:'找不到人員'});const name=String(req.body?.name||user.name).trim();const active=req.body?.is_active===undefined?!!user.is_active:!!req.body.is_active;const role=req.body?.role||user.role||'staff';const tenantIdValue=req.body?.tenant_id===null?null:(req.body?.tenant_id===undefined?user.tenant_id:Number(req.body.tenant_id));const password=String(req.body?.password||'');if(!name)return res.status(400).json({error:'姓名不可空白'});if(!['staff','company_admin'].includes(role))return res.status(400).json({error:'角色不正確'});if(role==='company_admin'&&!tenantIdValue)return res.status(400).json({error:'公司管理員必須隸屬一家公司'});const t=now();if(password){if(password.length<4)return res.status(400).json({error:'新密碼至少 4 碼'});const p=db.makePassword(password);db.prepare('UPDATE staff_users SET name=?,is_active=?,role=?,tenant_id=?,password_hash=?,password_salt=?,updated_at=? WHERE id=?').run(name,active?1:0,role,tenantIdValue,p.hash,p.salt,t,id);}else db.prepare('UPDATE staff_users SET name=?,is_active=?,role=?,tenant_id=?,updated_at=? WHERE id=?').run(name,active?1:0,role,tenantIdValue,t,id);res.json({success:true});});
app.delete('/api/admin/staff/:id',requireSuperAdmin,(req,res)=>{const id=Number(req.params.id);const u=db.prepare('SELECT * FROM staff_users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'找不到人員'});db.prepare('DELETE FROM staff_users WHERE id=?').run(id);db.prepare('DELETE FROM drafts WHERE employee_id=?').run(u.employee_id);res.json({success:true});});

// ===== 公司管理後台 =====
app.get('/api/company/session',requireCompanyAdmin,(req,res)=>res.json({loggedIn:true,user:{employee_id:req.session.employeeId,name:req.session.employeeName},tenant:getTenant(req)}));
app.get('/api/company/staff',requireCompanyAdmin,(req,res)=>{const rows=db.prepare(`SELECT id,employee_id,name,is_active,role,created_at,updated_at FROM staff_users WHERE tenant_id=? ORDER BY role DESC,is_active DESC,employee_id`).all(tenantId(req));res.json(rows);});
app.post('/api/company/staff',requireCompanyAdmin,(req,res)=>{const employeeId=String(req.body?.employee_id||'').trim();const name=String(req.body?.name||'').trim();const password=String(req.body?.password||'');if(!employeeId||!name||password.length<4)return res.status(400).json({error:'請填寫員編、姓名，且密碼至少 4 碼'});if(db.prepare('SELECT id FROM staff_users WHERE employee_id=?').get(employeeId))return res.status(400).json({error:'這個員編已存在'});const p=db.makePassword(password);const t=now();const info=db.prepare('INSERT INTO staff_users (employee_id,name,password_hash,password_salt,is_active,created_at,updated_at,role,tenant_id) VALUES (?,?,?,?,1,?,?,?,?,?)').run(employeeId,name,p.hash,p.salt,t,t,'staff',tenantId(req));res.json({success:true,id:info.lastInsertRowid});});
app.put('/api/company/staff/:id',requireCompanyAdmin,(req,res)=>{const id=Number(req.params.id);const u=db.prepare('SELECT * FROM staff_users WHERE id=? AND tenant_id=?').get(id,tenantId(req));if(!u)return res.status(404).json({error:'找不到人員'});if(u.role==='company_admin'&&u.id!==getUser(req).id)return res.status(400).json({error:'公司管理員帳號請由總後臺調整'});const name=String(req.body?.name||u.name).trim();const active=req.body?.is_active===undefined?!!u.is_active:!!req.body.is_active;const password=String(req.body?.password||'');if(!name)return res.status(400).json({error:'姓名不可空白'});const t=now();if(password){if(password.length<4)return res.status(400).json({error:'新密碼至少 4 碼'});const p=db.makePassword(password);db.prepare('UPDATE staff_users SET name=?,is_active=?,password_hash=?,password_salt=?,updated_at=? WHERE id=? AND tenant_id=?').run(name,active?1:0,p.hash,p.salt,t,id,tenantId(req));}else db.prepare('UPDATE staff_users SET name=?,is_active=?,updated_at=? WHERE id=? AND tenant_id=?').run(name,active?1:0,t,id,tenantId(req));res.json({success:true});});
app.delete('/api/company/staff/:id',requireCompanyAdmin,(req,res)=>{const id=Number(req.params.id);const u=db.prepare('SELECT * FROM staff_users WHERE id=? AND tenant_id=?').get(id,tenantId(req));if(!u)return res.status(404).json({error:'找不到人員'});if(u.id===getUser(req).id)return res.status(400).json({error:'不能刪除目前登入中的公司管理員'});if(u.role==='company_admin')return res.status(400).json({error:'請由總後臺處理公司管理員'});db.prepare('DELETE FROM staff_users WHERE id=? AND tenant_id=?').run(id,tenantId(req));res.json({success:true});});

app.get('/api/company/communities',requireCompanyAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM communities WHERE tenant_id=? ORDER BY status DESC,name').all(tenantId(req))));
app.post('/api/company/communities',requireCompanyAdmin,(req,res)=>{const name=String(req.body?.name||'').trim();if(!name)return res.status(400).json({error:'社區名稱不可空白'});const t=now();const info=db.prepare('INSERT INTO communities (tenant_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?)').run(tenantId(req),name,'active',t,t);res.json({success:true,id:info.lastInsertRowid});});
app.put('/api/company/communities/:id',requireCompanyAdmin,(req,res)=>{const id=Number(req.params.id);const c=db.prepare('SELECT * FROM communities WHERE id=? AND tenant_id=?').get(id,tenantId(req));if(!c)return res.status(404).json({error:'找不到社區'});const name=String(req.body?.name||c.name).trim();const status=req.body?.status===undefined?c.status:(req.body.status?'active':'inactive');if(!name)return res.status(400).json({error:'社區名稱不可空白'});db.prepare('UPDATE communities SET name=?,status=?,updated_at=? WHERE id=? AND tenant_id=?').run(name,status,now(),id,tenantId(req));res.json({success:true});});
app.get('/api/company/staff/:id/communities',requireCompanyAdmin,(req,res)=>{const id=Number(req.params.id);const u=db.prepare('SELECT id FROM staff_users WHERE id=? AND tenant_id=?').get(id,tenantId(req));if(!u)return res.status(404).json({error:'找不到人員'});const rows=db.prepare('SELECT c.id,c.name,c.status,CASE WHEN sc.staff_id IS NULL THEN 0 ELSE 1 END assigned FROM communities c LEFT JOIN staff_communities sc ON sc.community_id=c.id AND sc.staff_id=? WHERE c.tenant_id=? ORDER BY c.name').all(id,tenantId(req));res.json(rows);});
app.put('/api/company/staff/:id/communities',requireCompanyAdmin,(req,res)=>{const id=Number(req.params.id);const u=db.prepare("SELECT id,role FROM staff_users WHERE id=? AND tenant_id=?").get(id,tenantId(req));if(!u)return res.status(404).json({error:'找不到人員'});if(u.role==='company_admin')return res.status(400).json({error:'公司管理員不需要設定社區權限'});const ids=Array.isArray(req.body?.community_ids)?req.body.community_ids.map(Number).filter(Boolean):[];const valid=new Set(db.prepare('SELECT id FROM communities WHERE tenant_id=?').all(tenantId(req)).map(x=>x.id));if(ids.some(x=>!valid.has(x)))return res.status(400).json({error:'包含不屬於本公司的社區'});const tx=db.transaction(()=>{db.prepare('DELETE FROM staff_communities WHERE staff_id=?').run(id);const ins=db.prepare('INSERT INTO staff_communities (staff_id,community_id) VALUES (?,?)');for(const cid of ids)ins.run(id,cid);});tx();res.json({success:true});});
app.get('/api/company/submissions',requireCompanyAdmin,(req,res)=>{const rows=db.prepare(`SELECT s.id,s.created_at,s.updated_at,s.employee_id,s.employee_name,s.community_id,s.data,c.name community_name FROM submissions s LEFT JOIN communities c ON c.id=s.community_id WHERE s.tenant_id=? ORDER BY s.id DESC`).all(tenantId(req));res.json({submissions:rows.map(r=>({...r,data:JSON.parse(r.data)})),questions:readQuestions()});});
app.get('/api/company/templates',requireCompanyAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM templates WHERE tenant_id=? ORDER BY id DESC').all(tenantId(req))));
const upload=multer({storage:multer.diskStorage({destination:(req,file,cb)=>cb(null,TEMPLATES_DIR),filename:(req,file,cb)=>cb(null,Date.now()+'-'+file.originalname.replace(/[^\\w.\\-\\u4e00-\\u9fa5]/g,'_'))}),fileFilter:(req,file,cb)=>file.originalname.toLowerCase().endsWith('.docx')?cb(null,true):cb(new Error('只允許上傳 .docx 檔案'))});
app.post('/api/company/templates',requireCompanyAdmin,upload.single('template'),(req,res)=>{if(!req.file)return res.status(400).json({error:'未收到檔案'});db.prepare('INSERT INTO templates (name,filename,is_active,created_at,tenant_id) VALUES (?,?,0,?,?)').run(req.body.name||req.file.originalname,req.file.filename,now(),tenantId(req));res.json({success:true});});
app.post('/api/company/templates/:id/activate',requireCompanyAdmin,(req,res)=>{const id=Number(req.params.id);db.prepare('UPDATE templates SET is_active=0 WHERE tenant_id=?').run(tenantId(req));db.prepare('UPDATE templates SET is_active=1 WHERE id=? AND tenant_id=?').run(id,tenantId(req));res.json({success:true});});
app.delete('/api/company/templates/:id',requireCompanyAdmin,(req,res)=>{const tpl=db.prepare('SELECT * FROM templates WHERE id=? AND tenant_id=?').get(req.params.id,tenantId(req));if(tpl){const p=path.join(TEMPLATES_DIR,tpl.filename);if(fs.existsSync(p))fs.unlinkSync(p);db.prepare('DELETE FROM templates WHERE id=? AND tenant_id=?').run(req.params.id,tenantId(req));}res.json({success:true});});

function generateForSubmission(req,res,id,templateId){
  const submission=db.prepare('SELECT * FROM submissions WHERE id=? AND tenant_id=?').get(id,tenantId(req));
  if(!submission)return res.status(404).json({error:'找不到該筆紀錄'});
  const template=templateId?db.prepare('SELECT * FROM templates WHERE id=? AND (tenant_id=? OR tenant_id IS NULL)').get(templateId,tenantId(req)):(db.prepare('SELECT * FROM templates WHERE tenant_id=? AND is_active=1').get(tenantId(req))||db.prepare('SELECT * FROM templates WHERE tenant_id IS NULL AND is_active=1').get());
  if(!template)return res.status(400).json({error:'尚未設定公司 Word 範本，請先到「Word 範本」上傳並啟用一份範本'});
  try{const buffer=generateDocx(path.join(TEMPLATES_DIR,template.filename),JSON.parse(submission.data));const d=JSON.parse(submission.data);const fileName=`交接清冊_${d.community_name||submission.id}_${submission.id}.docx`;res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.send(buffer);}catch(err){console.error(err);res.status(500).json({error:'產生 Word 檔失敗，請確認範本內的 {{欄位代碼}} 是否正確',detail:err.message});}
}
app.get('/api/company/generate/:submissionId',requireCompanyAdmin,(req,res)=>generateForSubmission(req,res,Number(req.params.submissionId),req.query.templateId?Number(req.query.templateId):null));
app.delete('/api/company/submissions/:id',requireCompanyAdmin,(req,res)=>{db.prepare('DELETE FROM submissions WHERE id=? AND tenant_id=?').run(req.params.id,tenantId(req));res.json({success:true});});

// Super admin template management: templates without tenant are global; company templates are visible here too.
app.get('/api/admin/templates',requireSuperAdmin,(req,res)=>res.json(db.prepare(`SELECT tp.*,t.name tenant_name FROM templates tp LEFT JOIN tenants t ON t.id=tp.tenant_id ORDER BY tp.id DESC`).all()));
app.post('/api/admin/templates',requireSuperAdmin,upload.single('template'),(req,res)=>{if(!req.file)return res.status(400).json({error:'未收到檔案'});const tid=req.body.tenant_id?Number(req.body.tenant_id):null;db.prepare('INSERT INTO templates (name,filename,is_active,created_at,tenant_id) VALUES (?,?,0,?,?)').run(req.body.name||req.file.originalname,req.file.filename,now(),tid);res.json({success:true});});
app.post('/api/admin/templates/:id/activate',requireSuperAdmin,(req,res)=>{const tpl=db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);if(!tpl)return res.status(404).json({error:'找不到範本'});if(tpl.tenant_id===null) db.prepare('UPDATE templates SET is_active=0 WHERE tenant_id IS NULL').run(); else db.prepare('UPDATE templates SET is_active=0 WHERE tenant_id=?').run(tpl.tenant_id);db.prepare('UPDATE templates SET is_active=1 WHERE id=?').run(req.params.id);res.json({success:true});});
app.delete('/api/admin/templates/:id',requireSuperAdmin,(req,res)=>{const tpl=db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);if(tpl){const p=path.join(TEMPLATES_DIR,tpl.filename);if(fs.existsSync(p))fs.unlinkSync(p);db.prepare('DELETE FROM templates WHERE id=?').run(req.params.id);}res.json({success:true});});
app.get('/api/admin/generate/:submissionId',requireSuperAdmin,(req,res)=>{const submission=db.prepare('SELECT * FROM submissions WHERE id=?').get(req.params.submissionId);if(!submission)return res.status(404).json({error:'找不到該筆紀錄'});const template=req.query.templateId?db.prepare('SELECT * FROM templates WHERE id=?').get(req.query.templateId):(db.prepare('SELECT * FROM templates WHERE tenant_id=? AND is_active=1').get(submission.tenant_id)||db.prepare('SELECT * FROM templates WHERE tenant_id IS NULL AND is_active=1').get());if(!template)return res.status(400).json({error:'尚未設定該公司的 Word 範本'});try{const buffer=generateDocx(path.join(TEMPLATES_DIR,template.filename),JSON.parse(submission.data));const d=JSON.parse(submission.data);const fileName=`交接清冊_${d.community_name||submission.id}_${submission.id}.docx`;res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');res.send(buffer);}catch(err){console.error(err);res.status(500).json({error:'產生 Word 檔失敗',detail:err.message});}});

app.listen(PORT,()=>console.log(`V4 伺服器已啟動：http://localhost:${PORT}`));
