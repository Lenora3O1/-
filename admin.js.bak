let state = { activeTab:'submissions', submissions:[], questions:[], templates:[], config:null };

async function api(url, options={}) { const res=await fetch(url,options); let data={}; try{data=await res.json();}catch{} if(!res.ok) throw new Error(data.error||'操作失敗'); return data; }

async function checkSession(){
  const {isAdmin}=await api('/api/admin/session');
  document.getElementById('loginView').style.display=isAdmin?'none':'block';
  document.getElementById('mainView').style.display=isAdmin?'block':'none';
  document.getElementById('logoutWrap').style.display=isAdmin?'block':'none';
  if(isAdmin) initMain();
}

document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,password:password.value})});loginMsg.innerHTML='';checkSession();}catch(err){loginMsg.innerHTML=`<div class="msg error">${escapeHtml(err.message)}</div>`;}});
logoutBtn.addEventListener('click',async()=>{await api('/api/admin/logout',{method:'POST'});checkSession();});

document.querySelectorAll('.nav-tabs button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.activeTab=btn.dataset.tab;['submissions','templates','form'].forEach(t=>document.getElementById('tab-'+t).style.display=state.activeTab===t?'block':'none');if(state.activeTab==='templates')renderTemplates();if(state.activeTab==='form')renderFormDesigner();}));

async function initMain(){await loadSubmissions();await loadTemplates();await loadConfig();renderSubmissions();}
async function loadSubmissions(){const d=await api('/api/admin/submissions');state.submissions=d.submissions;}
async function loadTemplates(){state.templates=await api('/api/admin/templates');}
async function loadConfig(){state.config=await api('/api/admin/form-config');state.questions=state.config.questions;}

function renderSubmissions(){
 const el=document.getElementById('tab-submissions');
 if(!state.submissions.length){el.innerHTML='<div class="panel empty">目前還沒有任何填答紀錄。</div>';return;}
 const opts=state.templates.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}${t.is_active?'（預設）':''}</option>`).join('');
 el.innerHTML=`<div class="panel"><div class="section-title">填答紀錄（共 ${state.submissions.length} 筆）</div><p class="hint">這裡只負責查看填寫結果與產生 Word，不會影響表單題目設定。</p><div class="table-wrap"><table><thead><tr><th>編號</th><th>送出時間</th><th>社區</th><th>交接人員</th><th>操作</th></tr></thead><tbody>${state.submissions.map(s=>{const d=s.data;return `<tr><td>${s.id}</td><td>${new Date(s.created_at).toLocaleString('zh-TW')}</td><td>${escapeHtml(d.community_name||'')}</td><td>${escapeHtml(d.outgoing_manager||'')} → ${escapeHtml(d.incoming_manager||'')}</td><td><select id="tpl-${s.id}" ${!state.templates.length?'disabled':''}>${opts||'<option>尚未上傳範本</option>'}</select> <button class="secondary" onclick="downloadDocx(${s.id})" ${!state.templates.length?'disabled':''}>產生 Word</button> <button class="danger" onclick="deleteSubmission(${s.id})">刪除</button></td></tr>`}).join('')}</tbody></table></div></div>`;
}
async function downloadDocx(id){const v=document.getElementById(`tpl-${id}`)?.value||'';window.open(`/api/admin/generate/${id}?templateId=${encodeURIComponent(v)}`,'_blank');}
async function deleteSubmission(id){if(!confirm('確定刪除這筆紀錄嗎？此動作無法復原。'))return;await api(`/api/admin/submissions/${id}`,{method:'DELETE'});await loadSubmissions();renderSubmissions();}

function renderTemplates(){
 const el=document.getElementById('tab-templates');
 const rows=state.templates.map(t=>`<tr><td>${escapeHtml(t.name)}</td><td>${t.is_active?'<span class="tag gold">目前預設</span>':''}</td><td>${new Date(t.created_at).toLocaleString('zh-TW')}</td><td>${t.is_active?'':`<button class="secondary" onclick="activateTemplate(${t.id})">設為預設</button>`} <button class="danger" onclick="deleteTemplate(${t.id})">刪除</button></td></tr>`).join('');
 el.innerHTML=`<div class="panel"><div class="section-title">① Word 範本管理</div><p class="hint">Word 的字型、Logo、表格、頁首頁尾請直接在 Word 裡修改。系統只負責把 <code>{{欄位代碼}}</code> 填入範本。</p><form id="uploadForm"><div class="row"><input type="text" id="tplName" placeholder="範本名稱，例如：公司標準版 2026" required><input type="file" id="tplFile" accept=".docx" required></div><div style="margin-top:14px"><button type="submit">上傳 Word 範本</button></div></form></div><div class="panel"><div class="section-title">② 已上傳範本（共 ${state.templates.length} 份）</div>${state.templates.length?`<div class="table-wrap"><table><thead><tr><th>名稱</th><th>狀態</th><th>上傳時間</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty">尚未上傳範本。</div>'}</div>`;
 document.getElementById('uploadForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData();fd.append('name',tplName.value);fd.append('template',tplFile.files[0]);try{await api('/api/admin/templates',{method:'POST',body:fd});await loadTemplates();renderTemplates();}catch(err){alert(err.message);}});
}
async function activateTemplate(id){await api(`/api/admin/templates/${id}/activate`,{method:'POST'});await loadTemplates();renderTemplates();renderSubmissions();}
async function deleteTemplate(id){if(!confirm('確定刪除這份範本嗎？'))return;await api(`/api/admin/templates/${id}`,{method:'DELETE'});await loadTemplates();renderTemplates();renderSubmissions();}

// ===================== 表單設計器 =====================
function renderFormDesigner(){
 const el=document.getElementById('tab-form'); const c=state.config;
 el.innerHTML=`<div class="panel designer-intro"><div class="section-title">🛠 表單設計中心</div><p><strong>這裡就是未來你最常修改的地方。</strong> 不需要碰程式碼。</p><div class="guide-grid"><div><b>① 頁面名稱</b><br>修改「社區基本資料」「財務狀況」等母標題。</div><div><b>② 子標題</b><br>每個頁面可以自行建立分類，例如「社區基本資訊」「交接人員資訊」。</div><div><b>③ 題目文字</b><br>直接修改社區經理看到的問題。</div><div><b>④ 欄位代碼</b><br>給 Word 使用的識別碼。<strong>已有範本使用時不要任意修改。</strong></div></div></div>
 <div class="panel"><div class="section-title">網站基本名稱</div><div class="field"><label>網站標題</label><input id="siteTitle" value="${escapeAttr(c.title||'社區交接清冊')}"><div class="hint">會顯示在前台最上方。</div></div><div class="field"><label>副標題</label><input id="siteSubtitle" value="${escapeAttr(c.subtitle||'')}"></div></div>
 <div class="panel"><div class="section-title">① 頁面／母標題管理</div><p class="hint">一個「頁面」就是社區經理按一次「下一頁」看到的內容。用 ↑ ↓ 調整順序。</p><div id="pagesEditor"></div><button class="secondary" onclick="addPage()">＋ 新增頁面</button></div>
 <div class="panel"><div class="section-title">② 題目／子標題管理</div><p class="hint">「子標題」會把題目分成小區塊。用 ↑ ↓ 調整同一頁裡的題目順序。</p><div id="questionsEditor"></div><button class="secondary" onclick="addQuestion()">＋ 新增題目</button></div>
 <div class="save-bar"><button onclick="saveFormConfig()">💾 儲存全部表單設定</button><span id="formSaveMsg"></span></div>`;
 renderPagesEditor();renderQuestionsEditor();
}
function renderPagesEditor(){
 const wrap=document.getElementById('pagesEditor');
 wrap.innerHTML=state.config.pages.map((p,i)=>`<div class="page-card"><div class="move-buttons"><button class="icon-btn" onclick="movePage(${i},-1)" ${i===0?'disabled':''}>↑</button><button class="icon-btn" onclick="movePage(${i},1)" ${i===state.config.pages.length-1?'disabled':''}>↓</button></div><div class="page-number">第 ${i+1} 頁</div><div class="grow"><label>頁面／母標題</label><input value="${escapeAttr(p.title)}" oninput="state.config.pages[${i}].title=this.value"><label>頁面說明（可不填）</label><input value="${escapeAttr(p.description||'')}" oninput="state.config.pages[${i}].description=this.value"></div><button class="danger" onclick="removePage(${i})">刪除頁面</button></div>`).join('');
}
function renderQuestionsEditor(){
 const wrap=document.getElementById('questionsEditor');
 wrap.innerHTML=state.config.questions.map((q,i)=>`<div class="question-card"><div class="move-buttons"><button class="icon-btn" onclick="moveQuestion(${i},-1)" ${i===0?'disabled':''}>↑</button><button class="icon-btn" onclick="moveQuestion(${i},1)" ${i===state.config.questions.length-1?'disabled':''}>↓</button></div><div class="q-no">${i+1}</div><div class="grow"><div class="editor-grid"><div><label>所在頁面</label><select onchange="state.config.questions[${i}].pageId=this.value">${state.config.pages.map(p=>`<option value="${escapeAttr(p.id)}" ${q.pageId===p.id?'selected':''}>${escapeHtml(p.title)}</option>`).join('')}</select></div><div><label>子標題／小分類</label><input value="${escapeAttr(q.group||'填寫資料')}" oninput="state.config.questions[${i}].group=this.value"></div><div class="wide"><label>題目文字</label><input value="${escapeAttr(q.label)}" oninput="state.config.questions[${i}].label=this.value"></div><div><label>回答格式</label><select onchange="state.config.questions[${i}].type=this.value"><option value="text" ${q.type==='text'?'selected':''}>單行文字</option><option value="textarea" ${q.type==='textarea'?'selected':''}>多行文字</option><option value="number" ${q.type==='number'?'selected':''}>數字</option><option value="date" ${q.type==='date'?'selected':''}>日期</option></select></div><div><label>是否必填</label><select onchange="state.config.questions[${i}].required=this.value==='true'"><option value="true" ${q.required?'selected':''}>必填</option><option value="false" ${!q.required?'selected':''}>非必填</option></select></div><div class="wide"><label>欄位代碼 <span class="muted">（Word 會使用 {{${escapeHtml(q.id)}}}）</span></label><input class="code-input" value="${escapeAttr(q.id)}" oninput="state.config.questions[${i}].id=this.value.replace(/[^A-Za-z0-9_]/g,'_')"><div class="hint">建議維持原代碼；如果已經有 Word 範本，修改後範本中的代碼也要一起改。</div></div></div></div><button class="danger" onclick="removeQuestion(${i})">刪除</button></div>`).join('');
}
function addPage(){const id='page_'+Date.now();state.config.pages.push({id,title:'新頁面',description:''});renderFormDesigner();}
function removePage(i){const p=state.config.pages[i];const count=state.config.questions.filter(q=>q.pageId===p.id).length;if(count){alert(`「${p.title}」還有 ${count} 個題目，請先把這些題目移到其他頁面，再刪除。`);return;}if(state.config.pages.length<=1){alert('至少要保留一個頁面。');return;}state.config.pages.splice(i,1);renderFormDesigner();}
function movePage(i,dir){const j=i+dir;if(j<0||j>=state.config.pages.length)return;[state.config.pages[i],state.config.pages[j]]=[state.config.pages[j],state.config.pages[i]];renderPagesEditor();renderQuestionsEditor();}
function addQuestion(){if(!state.config.pages.length){alert('請先新增頁面。');return;}state.config.questions.push({id:'new_field_'+Date.now(),label:'新題目',type:'text',required:false,pageId:state.config.pages[0].id,group:'填寫資料'});renderQuestionsEditor();}
function removeQuestion(i){state.config.questions.splice(i,1);renderQuestionsEditor();}
function moveQuestion(i,dir){const j=i+dir;if(j<0||j>=state.config.questions.length)return;[state.config.questions[i],state.config.questions[j]]=[state.config.questions[j],state.config.questions[i]];renderQuestionsEditor();}
async function saveFormConfig(){
 const msg=document.getElementById('formSaveMsg');
 const ids=state.config.questions.map(q=>q.id.trim());
 if(ids.some(x=>!x)||new Set(ids).size!==ids.length){msg.innerHTML='<span class="msg error inline-msg">欄位代碼不可空白或重複。</span>';return;}
 if(!state.config.pages.length){msg.innerHTML='<span class="msg error inline-msg">至少需要一個頁面。</span>';return;}
 try{await api('/api/admin/form-config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.config)});msg.innerHTML='<span class="msg success inline-msg">✓ 已儲存！前台重新整理後立即套用。</span>';setTimeout(()=>{if(msg)msg.innerHTML=''},5000);}catch(err){msg.innerHTML=`<span class="msg error inline-msg">${escapeHtml(err.message)}</span>`;}
}
function escapeHtml(str){return String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(str){return escapeHtml(str);}
checkSession();
