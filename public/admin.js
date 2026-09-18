let state={submissions:[],templates:[],staff:[],tenants:[],config:null,brandingTenantId:null,branding:null};
const $=id=>document.getElementById(id);
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'操作失敗');return d;}
async function checkSession(){try{const r=await api('/api/admin/session');if(r.isAdmin){showMain();await loadAll()}else{$('loginView').style.display='block'}}catch(err){$('loginView').style.display='block';$('loginMsg').innerHTML=`<div class="msg error">${escapeHtml(err.message||'無法讀取登入狀態，請重新整理。')}</div>`}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});showMain();await loadAll()}catch(err){$('loginMsg').innerHTML=`<div class="msg error">${escapeHtml(err.message)}</div>`}});
$('logoutBtn').addEventListener('click',async()=>{await api('/api/admin/logout',{method:'POST'});location.reload()});
function showMain(){$('loginView').style.display='none';$('mainView').style.display='block';$('logoutWrap').style.display='block'}
for(const b of document.querySelectorAll('.nav-tabs button'))b.addEventListener('click',()=>{document.querySelectorAll('.nav-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');for(const id of ['tenants','submissions','staff','templates','form','branding'])$(`tab-${id}`).style.display=b.dataset.tab===id?'block':'none';});
async function loadAll(){
  const jobs=[['tenants',loadTenants,renderTenants],['submissions',loadSubmissions,renderSubmissions],['staff',loadStaff,renderStaff],['templates',loadTemplates,renderTemplates],['form',loadConfig,renderFormDesigner],['branding',loadBranding,renderBranding]];
  for(const [key] of jobs){const el=$(`tab-${key}`);if(el)el.innerHTML='<div class="panel"><div class="hint">⏳ 正在讀取資料…</div></div>';}
  for(const [key,loader,renderer] of jobs){
    try{await loader();renderer()}catch(err){
      const el=$(`tab-${key}`); if(el) el.innerHTML=`<div class="panel"><div class="msg error">${escapeHtml(err.message||'讀取資料失敗')}</div><p class="hint">此區塊讀取失敗，不會影響其他後臺功能。請重新整理後再試。</p></div>`;
      console.error('Admin load failed:',key,err);
    }
  }
}
async function loadTenants(){state.tenants=await api('/api/admin/tenants')}
async function loadSubmissions(){const r=await api('/api/admin/submissions');state.submissions=r.submissions}
async function loadTemplates(){state.templates=await api('/api/admin/templates')}
async function loadStaff(){state.staff=await api('/api/admin/staff')}
async function loadConfig(){state.config=await api('/api/admin/form-config');if(!state.config||!Array.isArray(state.config.pages)||!Array.isArray(state.config.questions)){throw new Error('中央表單設定格式不完整，請檢查 /data/form-config.json。')}}
function renderTenants(){
 const el=$('tab-tenants');
 const rows=state.tenants.map(t=>{
  const active=t.status==='active';
  const status=active?'<span class="tag success">合作中</span>':'<span class="tag">已停用</span>';
  const action=active
   ? `<button class="secondary" onclick="saveTenant(${t.id})">儲存</button> <button class="secondary" onclick="openResetCompanyAdminModal(${t.id},'${escapeAttr(t.admin_employee_id||'')}')">重設負責人密碼</button> <button class="danger" onclick="toggleTenantStatus(${t.id},false)">停用公司</button>`
   : `<button class="secondary" onclick="toggleTenantStatus(${t.id},true)">重新啟用</button>`;
  return `<tr><td><input id="tenant-name-${t.id}" value="${escapeAttr(t.name)}"></td><td><span class="muted">${escapeHtml(t.code)}</span></td><td><strong>${escapeHtml(t.admin_employee_id||'—')}</strong><br><span class="muted">負責人</span></td><td>${escapeHtml(t.admin_name||'—')}<br><span class="muted">公司管理員 ${t.admin_count||0} 人</span></td><td>${t.admin_employee_id?(t.admin_is_active?'<span class="tag success">帳號啟用</span>':'<span class="tag">帳號停用</span>'):'<span class="muted">未建立</span>'}<br><span class="muted">最後登入：${t.admin_last_login_at?formatDate(t.admin_last_login_at):'尚未登入'}</span></td><td>${t.staff_count}</td><td>${t.community_count}</td><td>${status}</td><td>${action}<br><button class="secondary" onclick="manageTenantAdmins(${t.id},'${escapeAttr(t.name)}')">管理公司管理員</button></td></tr>`;
 }).join('');
 el.innerHTML=`<div class="panel designer-intro"><div class="section-title">🏢 公司／租戶管理</div><p><strong>這裡是系統總後臺。</strong> 每建立一家公司，就可以產生一個獨立的公司管理後臺；公司管理員只會看到自己的公司資料。</p><p class="hint">公司停止合作時請使用「停用公司」而不是刪除。停用會立即禁止該公司的管理員與一般人員登入，但完整保留既有交接、草稿、社區與文件資料；日後恢復合作時可直接「重新啟用」。</p></div><div class="panel"><div class="section-title">＋ 建立新物業管理公司</div><p class="hint">建立公司會在彈出視窗中完成，不會把表單塞在頁面最下方。</p><button onclick="openAddTenantModal()">＋ 建立公司與負責人帳號</button></div><div class="panel"><div class="section-title">已建立公司（${state.tenants.length} 家）</div><p class="hint">每家公司可以有多位公司管理員。第一位建立的帳號為「公司負責人」；公司負責人可在公司後台新增／管理其他公司管理員。這樣老闆忙碌時，可授權總經理等主管代為管理總務、會計與現場人員帳號，不需要重複建立公司。</p><div class="table-wrap"><table><thead><tr><th>公司</th><th>公司代碼</th><th>負責人帳號</th><th>負責人／管理員</th><th>負責人登入狀態</th><th>一般人員</th><th>社區</th><th>合作狀態</th><th>操作</th></tr></thead><tbody>${rows||'<tr><td colspan="9" class="empty">目前尚未建立公司。</td></tr>'}</tbody></table></div></div>`;
}
function closeModal(btnOrEl){const backdrop=typeof btnOrEl==='string'?$(btnOrEl):btnOrEl?.closest?.('.modal-backdrop')||btnOrEl;if(backdrop){backdrop.remove();document.body.classList.remove('modal-open')}}
function openModal(title,content,wide=false){const box=document.createElement('div');box.className='modal-backdrop';box.innerHTML=`<div class="modal${wide?' modal-wide':''}" role="dialog" aria-modal="true"><button class="modal-close" type="button" aria-label="關閉">×</button><h2>${title}</h2>${content}</div>`;document.body.appendChild(box);document.body.classList.add('modal-open');box.querySelector('.modal-close').addEventListener('click',()=>closeModal(box));box.addEventListener('click',e=>{if(e.target===box)closeModal(box)});return box}
function openAddTenantModal(){const box=openModal('🏢 建立新物業管理公司',`<div class="modal-note">建立後會自動產生獨立的公司管理後台；第一位帳號會成為「公司負責人」。</div><form id="modalAddTenantForm"><div class="editor-grid"><div class="wide"><label>公司名稱</label><input id="newTenantName" placeholder="例如：○○物業管理有限公司" required></div><div><label>公司代碼（可留白自動產生）</label><input id="newTenantCode" placeholder="例如 abc-property"></div><div><label>公司負責人員編</label><input id="newTenantAdminId" placeholder="例如 CA1001" required></div><div><label>負責人姓名</label><input id="newTenantAdminName" placeholder="例如 王小明" required></div><div><label>初始密碼</label><input id="newTenantAdminPass" type="password" placeholder="至少 4 碼" required></div></div><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal(this)">取消</button><button type="submit">建立公司</button></div></form>`);box.querySelector('#modalAddTenantForm').addEventListener('submit',addTenant)}
async function addTenant(e){e.preventDefault();try{const employeeId=$('newTenantAdminId').value.trim();await api('/api/admin/tenants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newTenantName').value,code:$('newTenantCode').value,admin_employee_id:employeeId,admin_name:$('newTenantAdminName').value,admin_password:$('newTenantAdminPass').value})});closeModal(e.target.closest('.modal-backdrop'));await loadTenants();renderTenants();alert(`公司已建立！公司負責人員編：${employeeId}`)}catch(err){alert(err.message)}}
function openResetCompanyAdminModal(id,employeeId){const box=openModal('🔑 重設公司負責人密碼',`<p class="hint">公司負責人員編：<strong>${escapeHtml(employeeId||'—')}</strong></p><form id="resetOwnerForm"><div class="field"><label>新密碼</label><input id="resetOwnerPassword" type="password" minlength="4" placeholder="至少 4 碼" required></div><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal(this)">取消</button><button type="submit">確認重設密碼</button></div></form>`);box.querySelector('#resetOwnerForm').addEventListener('submit',async e=>{e.preventDefault();const password=$('resetOwnerPassword').value;if(password.length<4){alert('新密碼至少 4 碼');return}try{await api(`/api/admin/tenants/${id}/admin/reset-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});closeModal(box);alert('公司負責人密碼已重設。')}catch(err){alert(err.message)}})}
async function saveTenant(id){const t=state.tenants.find(x=>Number(x.id)===Number(id));try{await api(`/api/admin/tenants/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$(`tenant-name-${id}`).value,status:t?.status==='active'})});await loadTenants();renderTenants();alert('公司資料已儲存。')}catch(err){alert(err.message)}}
async function toggleTenantStatus(id,active){const t=state.tenants.find(x=>Number(x.id)===Number(id));if(!t)return;const message=active?`確定重新啟用「${t.name}」嗎？公司管理員與一般人員將可以重新登入。`:`確定停用「${t.name}」嗎？這不會刪除資料，但會立即禁止該公司的管理員與一般人員登入。`;if(!confirm(message))return;try{await api(`/api/admin/tenants/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:t.name,status:active})});await loadTenants();renderTenants()}catch(err){alert(err.message)}}
async function resetCompanyAdmin(id,employeeId){const password=prompt(`請為公司負責人 ${employeeId||''} 設定新密碼（至少 4 碼）：`);if(password===null)return;if(password.length<4){alert('新密碼至少 4 碼');return}if(!confirm(`確定要重設 ${employeeId||'公司負責人'} 的密碼嗎？`))return;try{await api(`/api/admin/tenants/${id}/admin/reset-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});alert('公司負責人密碼已重設。')}catch(err){alert(err.message)}}
async function manageTenantAdmins(id,name){try{const rows=await api(`/api/admin/tenants/${id}/admins`);const html=rows.map(u=>`<div class="admin-manage-row"><div><strong>${escapeHtml(u.name)}</strong> <span class="tag ${u.admin_level==='owner'?'gold':'success'}">${u.admin_level==='owner'?'公司負責人':'公司管理員'}</span><br><span class="muted">${escapeHtml(u.employee_id)}｜${u.is_active?'啟用':'停用'}｜最後登入：${u.last_login_at?formatDate(u.last_login_at):'尚未登入'}</span></div><div><button class="secondary" onclick="superEditCompanyAdmin(${u.id},'${escapeAttr(u.name)}',${u.is_active?'true':'false'})">編輯</button></div></div>`).join('');const box=document.createElement('div');box.className='modal-backdrop';box.innerHTML=`<div class="modal"><h2>🏢 ${escapeHtml(name)}｜公司管理員</h2><p class="hint">公司可以有多位管理員。平台總後臺可以協助管理，但公司日常新增管理員可由「公司負責人」在公司後台處理。</p><div class="check-list">${html||'<div class="empty">目前沒有公司管理員。</div>'}</div><hr><h3>＋ 直接新增公司管理員</h3><div class="editor-grid"><div><label>員編</label><input id="superNewAdminId" placeholder="例如 CA1002"></div><div><label>姓名</label><input id="superNewAdminName" placeholder="例如 王小明"></div><div><label>初始密碼</label><input id="superNewAdminPass" type="password" placeholder="至少 4 碼"></div></div><div class="form-nav"><button class="secondary" onclick="this.closest('.modal-backdrop').remove()">關閉</button><button onclick="superAddCompanyAdmin(${id},this)">建立公司管理員</button></div></div>`;document.body.appendChild(box)}catch(err){alert(err.message)}}
async function superAddCompanyAdmin(tenantIdValue,btn){const box=btn.closest('.modal');const employeeId=box.querySelector('#superNewAdminId').value.trim(),name=box.querySelector('#superNewAdminName').value.trim(),password=box.querySelector('#superNewAdminPass').value;if(!employeeId||!name||password.length<4){alert('請填寫員編、姓名，且密碼至少 4 碼');return}try{await api(`/api/admin/tenants/${tenantIdValue}/admins`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee_id:employeeId,name,password})});alert('公司管理員已建立。');box.closest('.modal-backdrop').remove();await loadTenants();renderTenants()}catch(err){alert(err.message)}}
function superEditCompanyAdmin(id,currentName,currentActive){const box=openModal('👤 編輯公司管理員',`<form id="editCompanyAdminForm"><div class="editor-grid"><div class="wide"><label>姓名</label><input id="editAdminName" value="${escapeAttr(currentName)}" required></div><div><label>帳號狀態</label><select id="editAdminActive"><option value="1" ${currentActive?'selected':''}>啟用</option><option value="0" ${!currentActive?'selected':''}>停用</option></select></div><div><label>新密碼（可留白）</label><input id="editAdminPass" type="password" placeholder="留白＝不修改"></div></div><div class="modal-actions"><button type="button" class="secondary" onclick="closeModal(this)">取消</button><button type="submit">儲存變更</button></div></form>`);const form=box.querySelector('#editCompanyAdminForm')||box.querySelector('form');form.addEventListener('submit',async e=>{e.preventDefault();const password=$('editAdminPass').value;if(password&&password.length<4){alert('新密碼至少 4 碼');return}try{await api(`/api/admin/company-admins/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('editAdminName').value.trim(),is_active:$('editAdminActive').value==='1',password})});closeModal(box);alert('公司管理員資料已更新。');await loadTenants();renderTenants()}catch(err){alert(err.message)}})}

async function loadBranding(){state.brandingTenantId=state.tenants[0]?.id||null;state.branding=null;if(state.brandingTenantId)state.branding=await api(`/api/admin/tenants/${state.brandingTenantId}/branding`)}
function renderBranding(){const el=$('tab-branding');if(!state.tenants.length){el.innerHTML='<div class="panel empty">請先建立公司，再設定各公司的系統美編。</div>';return}const t=state.tenants.find(x=>Number(x.id)===Number(state.brandingTenantId))||state.tenants[0];if(!state.branding||Number(state.branding.tenant_id)!==Number(t.id))state.branding={tenant_id:t.id,title:t.name,subtitle:'物業管理公司',loginTitle:'公司管理員登入',loginHint:'這裡是公司專屬管理後台。',intro:'這裡只管理您所屬公司的資料。',logoText:'',accent:'#2F6F5E',accentDark:'#204F42',bg:'#F7F7F4',panel:'#FFFFFF'};const b=state.branding;el.innerHTML=`<div class="panel designer-intro"><div class="section-title">🎨 各公司後台系統美編區</div><p><strong>依照「公司管理」中的公司逐一設定。</strong> 每家公司都有自己的系統名稱、登入文字與視覺色系；修改只會套用到選定的公司，不會影響其他公司。</p><div class="field"><label>選擇公司</label><select id="brandingTenantSelect">${state.tenants.map(x=>`<option value="${x.id}" ${Number(x.id)===Number(t.id)?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></div></div><div class="panel"><div class="section-title">① 系統名稱與品牌識別</div><div class="editor-grid"><div class="wide"><label>系統主標題</label><input id="brandTitle" value="${escapeAttr(b.title)}" placeholder="例如：○○物業管理服務平台"></div><div><label>系統副標題</label><input id="brandSubtitle" value="${escapeAttr(b.subtitle)}" placeholder="例如：物業管理部門"></div><div><label>品牌識別文字／Logo</label><input id="brandLogoText" value="${escapeAttr(b.logoText)}" placeholder="例如：○○物業"></div></div></div><div class="panel"><div class="section-title">② 登入頁與公司後台文字</div><div class="editor-grid"><div><label>公司管理員登入標題</label><input id="brandLoginTitle" value="${escapeAttr(b.loginTitle)}"></div><div class="wide"><label>公司管理員登入說明</label><textarea id="brandLoginHint">${escapeHtml(b.loginHint)}</textarea></div><div class="wide"><label>公司後台首頁說明</label><textarea id="brandIntro">${escapeHtml(b.intro)}</textarea></div></div></div><div class="panel"><div class="section-title">③ 頁面視覺美化</div><p class="hint">目前提供品牌主色、深色主色、頁面背景與內容卡片背景；未來可以再加入 Logo 圖片、更多版型等功能。</p><div class="editor-grid"><div><label>主色</label><div class="color-row"><input type="color" id="brandAccent" value="${escapeAttr(b.accent)}"><input id="brandAccentText" value="${escapeAttr(b.accent)}" class="code-input"></div></div><div><label>主色深色版</label><div class="color-row"><input type="color" id="brandAccentDark" value="${escapeAttr(b.accentDark)}"><input id="brandAccentDarkText" value="${escapeAttr(b.accentDark)}" class="code-input"></div></div><div><label>頁面背景</label><div class="color-row"><input type="color" id="brandBg" value="${escapeAttr(b.bg)}"><input id="brandBgText" value="${escapeAttr(b.bg)}" class="code-input"></div></div><div><label>內容卡片背景</label><div class="color-row"><input type="color" id="brandPanel" value="${escapeAttr(b.panel)}"><input id="brandPanelText" value="${escapeAttr(b.panel)}" class="code-input"></div></div></div><div id="brandingPreview" class="brand-preview"><div class="brand-preview-top"><strong id="previewTitle">${escapeHtml(b.logoText||b.title)}</strong><span id="previewSubtitle">${escapeHtml(b.subtitle)}</span></div><div class="brand-preview-body"><h3 id="previewLogin">${escapeHtml(b.loginTitle)}</h3><p id="previewHint">${escapeHtml(b.loginHint)}</p><button type="button" id="previewButton">登入</button></div></div></div><div class="save-bar"><button onclick="saveBranding()">💾 儲存此公司美編設定</button><span id="brandingSaveMsg"></span></div>`;wireBrandingInputs();}
function wireBrandingInputs(){const pairs=[['brandAccent','brandAccentText'],['brandAccentDark','brandAccentDarkText'],['brandBg','brandBgText'],['brandPanel','brandPanelText']];for(const [a,b] of pairs){$(a).addEventListener('input',()=>{if(/^#[0-9a-fA-F]{6}$/.test($(a).value))$(b).value=$(a).value;updateBrandPreview()});$(b).addEventListener('input',()=>{if(/^#[0-9a-fA-F]{6}$/.test($(b).value))$(a).value=$(b).value;updateBrandPreview()})}['brandTitle','brandSubtitle','brandLogoText','brandLoginTitle','brandLoginHint'].forEach(id=>$(id).addEventListener('input',updateBrandPreview));$('brandingTenantSelect').addEventListener('change',async()=>{state.brandingTenantId=Number($('brandingTenantSelect').value);try{state.branding=await api(`/api/admin/tenants/${state.brandingTenantId}/branding`);renderBranding()}catch(e){alert(e.message)}});updateBrandPreview()}
function updateBrandPreview(){const root=$('brandingPreview');if(!root)return;root.style.setProperty('--preview-accent',$('brandAccentText').value);root.style.setProperty('--preview-dark',$('brandAccentDarkText').value);root.style.setProperty('--preview-bg',$('brandBgText').value);root.style.setProperty('--preview-panel',$('brandPanelText').value);$('previewTitle').textContent=$('brandLogoText').value||$('brandTitle').value;$('previewSubtitle').textContent=$('brandSubtitle').value;$('previewLogin').textContent=$('brandLoginTitle').value;$('previewHint').textContent=$('brandLoginHint').value}
async function saveBranding(){const msg=$('brandingSaveMsg');const body={title:$('brandTitle').value,subtitle:$('brandSubtitle').value,logoText:$('brandLogoText').value,loginTitle:$('brandLoginTitle').value,loginHint:$('brandLoginHint').value,intro:$('brandIntro').value,accent:$('brandAccentText').value,accentDark:$('brandAccentDarkText').value,bg:$('brandBgText').value,panel:$('brandPanelText').value};try{const r=await api(`/api/admin/tenants/${state.brandingTenantId}/branding`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});state.branding=r.branding;msg.innerHTML='<span class="msg success inline-msg">✓ 已儲存，此設定只套用於這家公司。</span>';setTimeout(()=>msg.innerHTML='',4500)}catch(e){msg.innerHTML=`<span class="msg error inline-msg">${escapeHtml(e.message)}</span>`}}

function renderSubmissions(){const el=$('tab-submissions');if(!state.submissions.length){el.innerHTML='<div class="panel empty">目前還沒有正式送出的填答紀錄。</div>';return}const opts=state.templates.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}${t.is_active?'（預設）':''}</option>`).join('');el.innerHTML=`<div class="panel"><div class="section-title">📋 正式填答紀錄（共 ${state.submissions.length} 筆）</div><p class="hint">這裡只顯示已正式送出的交接清冊。填寫中的草稿會由員工登入後自己繼續。</p><div class="table-wrap"><table><thead><tr><th>編號</th><th>送出時間</th><th>公司</th><th>填寫人員</th><th>社區</th><th>交接人員</th><th>操作</th></tr></thead><tbody>${state.submissions.map(s=>{const d=s.data;return `<tr><td>${s.id}</td><td>${formatDate(s.created_at)}</td><td>${escapeHtml(s.tenant_name||'')}</td><td>${escapeHtml(s.employee_name||'')}<br><span class="muted">${escapeHtml(s.employee_id||'')}</span></td><td>${escapeHtml(d.community_name||'')}</td><td>${escapeHtml(d.outgoing_manager||'')} → ${escapeHtml(d.incoming_manager||'')}</td><td><select id="tpl-${s.id}" ${!state.templates.length?'disabled':''}>${opts||'<option>尚未上傳範本</option>'}</select> <button class="secondary" onclick="downloadDocx(${s.id})" ${!state.templates.length?'disabled':''}>產生 Word</button> <button class="danger" onclick="deleteSubmission(${s.id})">刪除</button></td></tr>`}).join('')}</tbody></table></div></div>`}
async function downloadDocx(id){const v=$(`tpl-${id}`)?.value||'';window.open(`/api/admin/generate/${id}?templateId=${encodeURIComponent(v)}`,'_blank')}
async function deleteSubmission(id){if(!confirm('確定刪除這筆正式紀錄嗎？'))return;await api(`/api/admin/submissions/${id}`,{method:'DELETE'});await loadSubmissions();renderSubmissions()}
function renderStaff(){const el=$('tab-staff');el.innerHTML=`<div class="panel"><div class="section-title">👥 全系統人員</div><p class="hint">總後臺可以查看所有公司的人員與角色；日常開通一般人員請交給各公司的公司管理員。</p><div class="table-wrap"><table><thead><tr><th>員編</th><th>姓名</th><th>公司</th><th>角色</th><th>狀態</th><th>密碼重設</th><th>操作</th></tr></thead><tbody>${state.staff.map(u=>`<tr><td><strong>${escapeHtml(u.employee_id)}</strong></td><td><input id="staff-name-${u.id}" value="${escapeAttr(u.name)}"></td><td><select id="staff-tenant-${u.id}">${state.tenants.map(t=>`<option value="${t.id}" ${Number(u.tenant_id)===Number(t.id)?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}</select></td><td><select id="staff-role-${u.id}"><option value="staff" ${u.role==='staff'?'selected':''}>一般人員</option><option value="company_admin" ${u.role==='company_admin'?'selected':''}>公司管理員</option></select></td><td><select id="staff-active-${u.id}"><option value="1" ${u.is_active?'selected':''}>啟用</option><option value="0" ${!u.is_active?'selected':''}>停用</option></select></td><td><input id="staff-pass-${u.id}" type="password" placeholder="留白＝不修改"></td><td><button class="secondary" onclick="saveStaff(${u.id})">儲存</button></td></tr>`).join('')}</tbody></table></div></div>`}
async function addStaff(e){e.preventDefault();try{await api('/api/admin/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee_id:$('newEmployeeId').value,name:$('newStaffName').value,password:$('newStaffPass').value})});await loadStaff();renderStaff();alert('已新增人員。')}catch(err){alert(err.message)}}
async function saveStaff(id){try{await api(`/api/admin/staff/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$(`staff-name-${id}`).value,is_active:$(`staff-active-${id}`).value==='1',password:$(`staff-pass-${id}`).value,role:$(`staff-role-${id}`).value,tenant_id:Number($(`staff-tenant-${id}`).value)})});await loadStaff();renderStaff()}catch(err){alert(err.message)}}
async function deleteStaff(id){if(!confirm('刪除人員後，他的未完成草稿也會被刪除；正式紀錄不會刪除。確定嗎？'))return;try{await api(`/api/admin/staff/${id}`,{method:'DELETE'});await loadStaff();renderStaff()}catch(err){alert(err.message)}}
function renderTemplates(){
  const el=$('tab-templates');
  const global=state.templates.filter(t=>t.tenant_id===null);
  const company=state.templates.filter(t=>t.tenant_id!==null);
  const globalRows=global.map(t=>`<tr><td><strong>${escapeHtml(t.name)}</strong></td><td>${t.is_active?'<span class="tag gold">平台預設</span>':'未啟用'}</td><td>${formatDate(t.created_at)}</td><td>${t.is_active?'':`<button class="secondary" onclick="activateTemplate(${t.id})">設為平台預設</button>`} <button class="danger" onclick="deleteTemplate(${t.id})">刪除</button></td></tr>`).join('');
  const companyRows=company.map(t=>`<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.tenant_name||'—')}</td><td>${t.is_active?'<span class="tag success">公司預設</span>':'未啟用'}</td><td>${formatDate(t.created_at)}</td></tr>`).join('');
  el.innerHTML=`
  <div class="panel"><div class="section-title">🏛 平台制式範本</div><p class="hint">這裡由系統總管理員提供「雛型」。各公司管理員可以自行選擇使用，系統會複製成該公司的版本；公司後續可以自行修改、更新或刪除，不會影響平台原始範本。</p>
  <form id="uploadGlobalTemplate"><div class="row"><input type="text" id="globalTplName" placeholder="例如：平台標準交接清冊 2026" required><input type="file" id="globalTplFile" accept=".docx" required></div><button type="submit">＋ 上傳平台制式範本</button></form></div>
  <div class="panel"><div class="section-title">📄 平台範本清單（${global.length} 份）</div>${global.length?`<div class="table-wrap"><table><thead><tr><th>名稱</th><th>狀態</th><th>建立時間</th><th>操作</th></tr></thead><tbody>${globalRows}</tbody></table></div>`:'<div class="empty">目前沒有平台制式範本。你可以從這裡上傳第一份雛型。</div>'}</div>
  <div class="panel"><div class="section-title">🏢 各公司已建立的範本（${company.length} 份）</div><p class="hint">這些是公司管理員從平台範本建立或自行上傳的版本。總後臺可以查看，但內容與管理權仍屬各公司。</p>${company.length?`<div class="table-wrap"><table><thead><tr><th>名稱</th><th>公司</th><th>狀態</th><th>建立時間</th></tr></thead><tbody>${companyRows}</tbody></table></div>`:'<div class="empty">目前還沒有公司自己的範本。</div>'}</div>`;
  $('uploadGlobalTemplate').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData();fd.append('name',$('globalTplName').value);fd.append('template',$('globalTplFile').files[0]);await api('/api/admin/templates',{method:'POST',body:fd});await loadTemplates();renderTemplates();alert('平台制式範本已上傳。')}catch(err){alert(err.message)}})
}
async function activateTemplate(id){try{await api(`/api/admin/templates/${id}/activate`,{method:'POST'});await loadTemplates();renderTemplates()}catch(err){alert(err.message)}}
async function deleteTemplate(id){if(!confirm('確定刪除這份平台制式範本嗎？已經複製到各公司的版本不會受影響。'))return;try{await api(`/api/admin/templates/${id}`,{method:'DELETE'});await loadTemplates();renderTemplates()}catch(err){alert(err.message)}}
function renderFormDesigner(){
  const el=$('tab-form'),c=state.config||{},u=c.uiTexts||{};
  el.innerHTML=`
  <div class="panel designer-intro">
    <div class="section-title">🛠 中央表單設計中心</div>
    <p><strong>這裡是平台提供標準雛型的地方。</strong> 目前先分成「交接清冊」與「工作日誌」兩套獨立表單；未來可以再增加其他平台制式表單。各公司採用後，再於自己的公司後台建立公司版本。</p>
  </div>

  <div class="module-card-grid">
    <div class="panel module-card">
      <div class="module-card-icon">📋</div>
      <div class="module-card-body">
        <div class="section-title">交接清冊</div>
        <p><strong>目前正式使用中的交接清冊。</strong><br>這套表單已確認可以正常使用，以下設計內容維持獨立，不與工作日誌共用。</p>
        <button class="secondary" onclick="toggleDesigner('checklistDesigner','checklistBtn')" id="checklistBtn">進入交接清冊設計</button>
      </div>
    </div>

    <div class="panel module-card">
      <div class="module-card-icon">📝</div>
      <div class="module-card-body">
        <div class="section-title">工作日誌</div>
        <p><strong>社區經理日常工作回報。</strong><br>未來會像交接清冊一樣，由平台設定表單，經理登入後選擇社區並填寫、儲存草稿、送出回報。</p>
        <button class="secondary" onclick="toggleDesigner('journalDesigner','journalBtn')" id="journalBtn">進入工作日誌設計</button>
      </div>
    </div>

    <div class="panel module-card">
      <div class="module-card-icon">📄</div>
      <div class="module-card-body">
        <div class="section-title">公司內部制式表格</div>
        <p><strong>平台提供文件雛型。</strong><br>各公司管理員可以自行採用、修改、更新或刪除，成為自己的公司制式文件。</p>
        <button class="secondary" onclick="document.querySelector('[data-tab=templates]').click()">前往制式範本管理</button>
      </div>
    </div>
  </div>

  <div id="journalDesigner" class="designer-collapsible" style="display:none">
    <div class="panel">
      <div class="section-title">⚙️ 工作日誌設計</div>
      <p><strong>這裡先建立工作日誌的獨立入口。</strong> 下一階段會在此加入與交接清冊相同的表單設計功能，例如頁面、子標題、題目、回答格式、必填設定與排序。</p>
      <div class="msg inline-msg">🚧 工作日誌填寫系統尚未啟用。現在先整理總後台架構，完成後再接上經理前台與公司後台。</div>
    </div>
  </div>

  <div id="checklistDesigner" class="designer-collapsible" style="display:none">
    <div class="panel">
      <div class="section-title">⚙️ 交接清冊雛型設定</div>
      <p class="hint">以下就是目前已經確認 OK 的交接清冊設定。這裡的修改只會作用於交接清冊；工作日誌使用另一套獨立設定。</p>
    </div>
    <div class="panel">
      <div class="section-title">① 網站基本名稱</div>
      <div class="field"><label>網站標題</label><input id="siteTitle" value="${escapeAttr(c.title||'社區交接清冊')}"></div>
      <div class="field"><label>副標題</label><input id="siteSubtitle" value="${escapeAttr(c.subtitle||'')}"></div>
    </div>
    <div class="panel">
      <div class="section-title">② 公司管理後台／登入頁顯示文字</div>
      <p class="hint">這些就是公司管理員畫面上看到的標題與說明文字。修改後按最下面的「儲存全部交接清冊設定」即可套用。</p>
      <div class="editor-grid">
        <div><label>公司後台標題</label><input id="companyTitle" value="${escapeAttr(u.companyTitle||'公司管理後台')}"></div>
        <div><label>公司後台副標題</label><input id="companySubtitle" value="${escapeAttr(u.companySubtitle||'物業管理公司')}"></div>
        <div class="wide"><label>公司後台首頁說明</label><textarea id="companyIntro">${escapeHtml(u.companyIntro||'')}</textarea></div>
        <div><label>公司管理員登入標題</label><input id="companyLoginTitle" value="${escapeAttr(u.companyLoginTitle||'公司管理員登入')}"></div>
        <div><label>公司管理員登入說明</label><textarea id="companyLoginHint">${escapeHtml(u.companyLoginHint||'')}</textarea></div>
        <div><label>一般人員登入標題</label><input id="staffLoginTitle" value="${escapeAttr(u.staffLoginTitle||'物業人員登入')}"></div>
        <div><label>一般人員登入說明</label><textarea id="staffLoginHint">${escapeHtml(u.staffLoginHint||'')}</textarea></div>
      </div>
    </div>
    <div class="panel">
      <div class="section-title">③ 交接清冊頁面／母標題管理</div>
      <div id="pagesEditor"></div>
      <button class="secondary" onclick="addPage()">＋ 新增頁面</button>
    </div>
    <div class="panel">
      <div class="section-title">④ 交接清冊題目／子標題管理</div>
      <p class="hint">題目會依「所在頁面＋子標題」自動分組顯示。題目 ↑↓ 只調整同一子標題內的順序。</p>
      <div id="questionsEditor"></div>
      <button class="secondary" onclick="addQuestion()">＋ 新增題目</button>
    </div>
    <div class="save-bar"><button onclick="saveFormConfig()">💾 儲存全部交接清冊設定</button><span id="formSaveMsg"></span></div>
  </div>`;
  renderPagesEditor();renderQuestionsEditor();
}
function toggleDesigner(id,buttonId){
  const box=$(id),btn=$(buttonId);if(!box)return;
  const opening=box.style.display==='none'||!box.style.display;
  document.querySelectorAll('.designer-collapsible').forEach(x=>{if(x!==box)x.style.display='none'});
  document.querySelectorAll('.module-card button').forEach(x=>{if(x!==btn)x.textContent=x.id==='journalBtn'?'進入工作日誌設計':'進入交接清冊設計'});
  box.style.display=opening?'block':'none';
  if(btn)btn.textContent=opening?(id==='journalDesigner'?'收起工作日誌設計':'收起交接清冊設計'):(id==='journalDesigner'?'進入工作日誌設計':'進入交接清冊設計');
  if(opening)box.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPagesEditor(){const w=$('pagesEditor');w.innerHTML=state.config.pages.map((p,i)=>`<div class="page-card"><div class="move-buttons"><button class="icon-btn" onclick="movePage(${i},-1)" ${i===0?'disabled':''}>↑</button><button class="icon-btn" onclick="movePage(${i},1)" ${i===state.config.pages.length-1?'disabled':''}>↓</button></div><div class="page-number">第 ${i+1} 頁</div><div class="grow"><label>頁面／母標題</label><input value="${escapeAttr(p.title)}" oninput="state.config.pages[${i}].title=this.value"><label>頁面說明</label><input value="${escapeAttr(p.description||'')}" oninput="state.config.pages[${i}].description=this.value"></div><button class="danger" onclick="removePage(${i})">刪除頁面</button></div>`).join('')}
function groupNamesForPage(pageId){const seen=[];for(const q of state.config.questions){if(q.pageId===pageId){const g=q.group||'填寫資料';if(!seen.includes(g))seen.push(g)}}return seen}
function renderQuestionsEditor(){const w=$('questionsEditor');const pages=state.config.pages;w.innerHTML=pages.map((p,pi)=>{const groups=groupNamesForPage(p.id);const qs=groups.flatMap(g=>state.config.questions.map((q,i)=>({q,i})).filter(x=>x.q.pageId===p.id&&(x.q.group||'填寫資料')===g));return `<div class="designer-page-block"><h3>第 ${pi+1} 頁｜${escapeHtml(p.title)}</h3>${groups.map(g=>`<div class="group-block"><div class="group-heading"><strong>▰ ${escapeHtml(g)}</strong><span>${qs.filter(x=>(x.q.group||'填寫資料')===g).length} 題</span></div>${qs.filter(x=>(x.q.group||'填寫資料')===g).map(x=>questionCard(x.i,x.q,qs.filter(y=>(y.q.group||'填寫資料')===g).map(y=>y.i))).join('')}</div>`).join('')||'<div class="empty">這一頁目前沒有題目。</div>'}</div>`}).join('')}
function questionCard(i,q,groupIndexes){const pos=groupIndexes.indexOf(i);return `<div class="question-card"><div class="move-buttons"><button class="icon-btn" onclick="moveQuestionWithinGroup(${i},-1)" ${pos<=0?'disabled':''}>↑</button><button class="icon-btn" onclick="moveQuestionWithinGroup(${i},1)" ${pos===groupIndexes.length-1?'disabled':''}>↓</button></div><div class="q-no">${pos+1}</div><div class="grow"><div class="editor-grid"><div><label>所在頁面</label><select onchange="changeQuestionPage(${i},this.value)">${state.config.pages.map(p=>`<option value="${escapeAttr(p.id)}" ${q.pageId===p.id?'selected':''}>${escapeHtml(p.title)}</option>`).join('')}</select></div><div><label>子標題／小分類</label><input value="${escapeAttr(q.group||'填寫資料')}" oninput="state.config.questions[${i}].group=this.value"></div><div class="wide"><label>題目文字</label><input value="${escapeAttr(q.label)}" oninput="state.config.questions[${i}].label=this.value"></div><div><label>回答格式</label><select onchange="state.config.questions[${i}].type=this.value"><option value="text" ${q.type==='text'?'selected':''}>單行文字</option><option value="textarea" ${q.type==='textarea'?'selected':''}>多行文字</option><option value="number" ${q.type==='number'?'selected':''}>數字</option><option value="date" ${q.type==='date'?'selected':''}>日期</option></select></div><div><label>是否必填</label><select onchange="state.config.questions[${i}].required=this.value==='true'"><option value="true" ${q.required?'selected':''}>必填</option><option value="false" ${!q.required?'selected':''}>非必填</option></select></div><div class="wide"><label>欄位代碼</label><input class="code-input" value="${escapeAttr(q.id)}" oninput="state.config.questions[${i}].id=this.value.replace(/[^A-Za-z0-9_]/g,'_')"></div></div></div><button class="danger" onclick="removeQuestion(${i})">刪除</button></div>`}
function addPage(){state.config.pages.push({id:'page_'+Date.now(),title:'新頁面',description:''});renderFormDesigner()}
function removePage(i){const p=state.config.pages[i];if(state.config.questions.some(q=>q.pageId===p.id)){alert('請先把這一頁的題目移到其他頁面。');return}if(state.config.pages.length<=1){alert('至少要保留一個頁面。');return}state.config.pages.splice(i,1);renderFormDesigner()}
function movePage(i,d){const j=i+d;if(j<0||j>=state.config.pages.length)return;[state.config.pages[i],state.config.pages[j]]=[state.config.pages[j],state.config.pages[i]];renderPagesEditor();renderQuestionsEditor()}
function addQuestion(){if(!state.config.pages.length)return;const p=state.config.pages[0];const groups=groupNamesForPage(p.id);state.config.questions.push({id:'new_field_'+Date.now(),label:'新題目',type:'text',required:false,pageId:p.id,group:groups[0]||'填寫資料'});renderQuestionsEditor()}
function changeQuestionPage(i,pageId){state.config.questions[i].pageId=pageId;const groups=groupNamesForPage(pageId);if(!groups.includes(state.config.questions[i].group))state.config.questions[i].group=groups[0]||'填寫資料';renderQuestionsEditor()}
function moveQuestionWithinGroup(i,d){const q=state.config.questions[i],same=state.config.questions.map((x,idx)=>({x,idx})).filter(o=>o.x.pageId===q.pageId&&(o.x.group||'填寫資料')===(q.group||'填寫資料')).map(o=>o.idx);const pos=same.indexOf(i),j=pos+d;if(j<0||j>=same.length)return;const target=same[j];[state.config.questions[i],state.config.questions[target]]=[state.config.questions[target],state.config.questions[i]];renderQuestionsEditor()}
function removeQuestion(i){state.config.questions.splice(i,1);renderQuestionsEditor()}
async function saveFormConfig(){const msg=$('formSaveMsg');state.config.title=$('siteTitle').value;state.config.subtitle=$('siteSubtitle').value;state.config.uiTexts={...(state.config.uiTexts||{}),companyTitle:$('companyTitle').value,companySubtitle:$('companySubtitle').value,companyIntro:$('companyIntro').value,companyLoginTitle:$('companyLoginTitle').value,companyLoginHint:$('companyLoginHint').value,staffLoginTitle:$('staffLoginTitle').value,staffLoginHint:$('staffLoginHint').value};const ids=state.config.questions.map(q=>q.id.trim());if(ids.some(x=>!x)||new Set(ids).size!==ids.length){msg.innerHTML='<span class="msg error inline-msg">欄位代碼不可空白或重複。</span>';return}try{await api('/api/admin/form-config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.config)});msg.innerHTML='<span class="msg success inline-msg">✓ 已儲存！</span>';setTimeout(()=>msg.innerHTML='',4000)}catch(err){msg.innerHTML=`<span class="msg error inline-msg">${escapeHtml(err.message)}</span>`}}
function formatDate(s){return new Date(s).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function escapeHtml(str){return String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function escapeAttr(s){return escapeHtml(s)}
checkSession();

// V4.3.0：按 ESC 關閉目前的懸浮視窗
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const boxes=document.querySelectorAll('.modal-backdrop');if(boxes.length){const box=boxes[boxes.length-1];box.remove();document.body.classList.remove('modal-open')}}});
