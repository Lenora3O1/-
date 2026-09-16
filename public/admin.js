let state = {
  activeTab: 'submissions',
  submissions: [],
  questions: [],
  templates: [],
};

// ---------- 登入 / 登出 ----------

async function checkSession() {
  const res = await fetch('/api/admin/session');
  const { isAdmin } = await res.json();
  document.getElementById('loginView').style.display = isAdmin ? 'none' : 'block';
  document.getElementById('mainView').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('logoutWrap').style.display = isAdmin ? 'block' : 'none';
  if (isAdmin) initMain();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const result = await res.json();
  const msgEl = document.getElementById('loginMsg');
  if (!res.ok) {
    msgEl.innerHTML = `<div class="msg error">${result.error}</div>`;
  } else {
    msgEl.innerHTML = '';
    checkSession();
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  checkSession();
});

// ---------- Tabs ----------

document.querySelectorAll('.nav-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeTab = btn.dataset.tab;
    document.getElementById('tab-submissions').style.display = state.activeTab === 'submissions' ? 'block' : 'none';
    document.getElementById('tab-templates').style.display = state.activeTab === 'templates' ? 'block' : 'none';
    document.getElementById('tab-questions').style.display = state.activeTab === 'questions' ? 'block' : 'none';
    if (state.activeTab === 'templates') renderTemplates();
    if (state.activeTab === 'questions') renderQuestions();
  });
});

async function initMain() {
  await loadSubmissions();
  await loadTemplates();
  await loadQuestions();
  renderSubmissions();
}

// ---------- 填答紀錄 ----------

async function loadSubmissions() {
  const res = await fetch('/api/admin/submissions');
  const data = await res.json();
  state.submissions = data.submissions;
  state.questions = data.questions;
}

async function loadTemplates() {
  const res = await fetch('/api/admin/templates');
  state.templates = await res.json();
}

function renderSubmissions() {
  const el = document.getElementById('tab-submissions');
  if (state.submissions.length === 0) {
    el.innerHTML = `<div class="panel empty">目前還沒有任何填答紀錄</div>`;
    return;
  }

  const templateOptions = state.templates
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}${t.is_active ? '（預設）' : ''}</option>`)
    .join('');

  const rows = state.submissions
    .map((s) => {
      const d = s.data;
      return `
        <tr>
          <td>${s.id}</td>
          <td>${new Date(s.created_at).toLocaleString('zh-TW')}</td>
          <td>${escapeHtml(d.community_name || '')}</td>
          <td>${escapeHtml(d.outgoing_manager || '')} → ${escapeHtml(d.incoming_manager || '')}</td>
          <td>
            <select id="tpl-${s.id}" ${state.templates.length === 0 ? 'disabled' : ''}>
              ${templateOptions || '<option>尚未上傳範本</option>'}
            </select>
            <button class="secondary" onclick="downloadDocx(${s.id})" ${state.templates.length === 0 ? 'disabled' : ''}>產生 Word</button>
            <button class="danger" onclick="deleteSubmission(${s.id})">刪除</button>
          </td>
        </tr>`;
    })
    .join('');

  el.innerHTML = `
    <div class="panel">
      <div class="section-title">所有填答紀錄（共 ${state.submissions.length} 筆）</div>
      <table>
        <thead><tr><th>編號</th><th>送出時間</th><th>社區名稱</th><th>交接人 → 接任人</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function downloadDocx(id) {
  const select = document.getElementById(`tpl-${id}`);
  const templateId = select ? select.value : '';
  window.open(`/api/admin/generate/${id}?templateId=${templateId}`, '_blank');
}

async function deleteSubmission(id) {
  if (!confirm('確定要刪除這筆紀錄嗎？此動作無法復原。')) return;
  await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' });
  await loadSubmissions();
  renderSubmissions();
}

// ---------- Word 範本管理 ----------

function renderTemplates() {
  const el = document.getElementById('tab-templates');

  const rows = state.templates
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.name)}</td>
        <td>${t.is_active ? '<span class="tag gold">目前預設</span>' : ''}</td>
        <td>${new Date(t.created_at).toLocaleString('zh-TW')}</td>
        <td>
          ${t.is_active ? '' : `<button class="secondary" onclick="activateTemplate(${t.id})">設為預設</button>`}
          <button class="danger" onclick="deleteTemplate(${t.id})">刪除</button>
        </td>
      </tr>`
    )
    .join('');

  el.innerHTML = `
    <div class="panel">
      <div class="section-title">上傳新範本</div>
      <p class="hint">
        請先用 Microsoft Word 設計好版型（字型、顏色、頁首頁尾、Logo 等皆可自由設計），
        並在需要帶入資料的地方輸入 <code>{{欄位代碼}}</code>，例如 <code>{{community_name}}</code>、<code>{{handover_date}}</code>。
        欄位代碼請對照「表單題目設定」分頁中的代碼。上傳的檔案需為 .docx 格式。
      </p>
      <form id="uploadForm">
        <div class="row">
          <input type="text" id="tplName" placeholder="範本名稱，例如：標準交接清冊範本 v1" required>
          <input type="file" id="tplFile" accept=".docx" required>
        </div>
        <div style="margin-top:14px;"><button type="submit">上傳範本</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="section-title">已上傳的範本（共 ${state.templates.length} 份）</div>
      ${
        state.templates.length === 0
          ? '<div class="empty">尚未上傳任何範本，請先在上方上傳一份 .docx 範本並設為預設。</div>'
          : `<table><thead><tr><th>名稱</th><th>狀態</th><th>上傳時間</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`
      }
    </div>`;

  document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('tplName').value;
    const file = document.getElementById('tplFile').files[0];
    const fd = new FormData();
    fd.append('name', name);
    fd.append('template', file);

    const res = await fetch('/api/admin/templates', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json();
      alert('上傳失敗：' + (err.error || '未知錯誤'));
      return;
    }
    await loadTemplates();
    renderTemplates();
  });
}

async function activateTemplate(id) {
  await fetch(`/api/admin/templates/${id}/activate`, { method: 'POST' });
  await loadTemplates();
  renderTemplates();
  renderSubmissions();
}

async function deleteTemplate(id) {
  if (!confirm('確定要刪除這份範本嗎？')) return;
  await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' });
  await loadTemplates();
  renderTemplates();
  renderSubmissions();
}

// ---------- 表單題目設定 ----------

async function loadQuestions() {
  const res = await fetch('/api/admin/questions');
  state.questions = await res.json();
}

function renderQuestions() {
  const el = document.getElementById('tab-questions');

  const rows = state.questions
    .map(
      (q, i) => `
      <tr data-idx="${i}">
        <td><input type="text" value="${escapeHtml(q.section || '')}" data-field="section" style="min-width:100px;"></td>
        <td><input type="text" value="${escapeHtml(q.label)}" data-field="label" style="min-width:150px;"></td>
        <td><input type="text" value="${escapeHtml(q.id)}" data-field="id" style="min-width:140px;font-family:monospace;"></td>
        <td>
          <select data-field="type">
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>單行文字</option>
            <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>多行文字</option>
            <option value="number" ${q.type === 'number' ? 'selected' : ''}>數字</option>
            <option value="date" ${q.type === 'date' ? 'selected' : ''}>日期</option>
          </select>
        </td>
        <td style="text-align:center;"><input type="checkbox" data-field="required" ${q.required ? 'checked' : ''}></td>
        <td><button class="danger" onclick="removeQuestion(${i})">刪除</button></td>
      </tr>`
    )
    .join('');

  el.innerHTML = `
    <div class="panel">
      <div class="section-title">表單題目設定</div>
      <p class="hint">
        「欄位代碼」會對應到 Word 範本裡的 <code>{{欄位代碼}}</code>，建議使用英文字母、數字、底線，且不要重複。
        調整後記得按下方「儲存設定」，前台表單會立即套用新的題目。
      </p>
      <table id="questionsTable">
        <thead><tr><th>分類（章節）</th><th>題目文字</th><th>欄位代碼</th><th>類型</th><th style="text-align:center;">必填</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:16px;" class="row">
        <button class="secondary" onclick="addQuestion()">+ 新增題目</button>
        <button onclick="saveQuestions()">儲存設定</button>
      </div>
      <div id="qSaveMsg"></div>
    </div>`;

  document.querySelectorAll('#questionsTable tbody tr').forEach((tr) => {
    tr.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => syncQuestionFromRow(tr));
      input.addEventListener('change', () => syncQuestionFromRow(tr));
    });
  });
}

function syncQuestionFromRow(tr) {
  const idx = Number(tr.dataset.idx);
  const q = state.questions[idx];
  tr.querySelectorAll('[data-field]').forEach((input) => {
    const field = input.dataset.field;
    if (field === 'required') q[field] = input.checked;
    else q[field] = input.value;
  });
}

function addQuestion() {
  state.questions.push({ id: 'new_field_' + (state.questions.length + 1), label: '新題目', type: 'text', required: false, section: '其他' });
  renderQuestions();
}

function removeQuestion(idx) {
  state.questions.splice(idx, 1);
  renderQuestions();
}

async function saveQuestions() {
  const ids = state.questions.map((q) => q.id);
  const hasDup = new Set(ids).size !== ids.length;
  if (hasDup) {
    document.getElementById('qSaveMsg').innerHTML = '<div class="msg error">欄位代碼重複，請修正後再儲存。</div>';
    return;
  }
  const res = await fetch('/api/admin/questions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.questions),
  });
  const msgEl = document.getElementById('qSaveMsg');
  msgEl.innerHTML = res.ok
    ? '<div class="msg success">已儲存，前台表單已更新。</div>'
    : '<div class="msg error">儲存失敗，請再試一次。</div>';
}

// ---------- utils ----------

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

checkSession();
