let formConfig = null;
let answers = {};
let currentPage = 0;

async function loadForm() {
  const res = await fetch('/api/form-config');
  if (!res.ok) throw new Error('無法載入表單設定');
  formConfig = await res.json();
  document.title = formConfig.title || '社區交接清冊';
  document.querySelector('.brand').textContent = formConfig.title || '社區交接清冊';
  document.querySelector('.sub').textContent = formConfig.subtitle || '';
  renderPage();
}

function getPageQuestions(pageId) {
  return formConfig.questions.filter(q => q.pageId === pageId);
}

function groupedQuestions(pageId) {
  const groups = [];
  const map = {};
  for (const q of getPageQuestions(pageId)) {
    const key = q.group || '填寫資料';
    if (!map[key]) { map[key] = { title: key, questions: [] }; groups.push(map[key]); }
    map[key].questions.push(q);
  }
  return groups;
}

function renderPage() {
  const form = document.getElementById('checklistForm');
  const page = formConfig.pages[currentPage];
  const total = formConfig.pages.length;
  form.innerHTML = '';
  renderProgress();

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `<div class="eyebrow">第 ${currentPage + 1} 頁／共 ${total} 頁</div><h1>${escapeHtml(page.title)}</h1>${page.description ? `<p>${escapeHtml(page.description)}</p>` : ''}`;
  form.appendChild(header);

  for (const group of groupedQuestions(page.id)) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = group.title;
    panel.appendChild(title);
    for (const q of group.questions) panel.appendChild(renderField(q));
    form.appendChild(panel);
  }

  const nav = document.createElement('div');
  nav.className = 'form-nav';
  nav.innerHTML = `<button type="button" class="secondary" id="prevBtn" ${currentPage === 0 ? 'disabled' : ''}>← 上一頁</button>${currentPage < total - 1 ? '<button type="button" id="nextBtn">下一頁 →</button>' : '<button type="submit" id="submitBtn">確認並送出交接清冊 ✓</button>'}`;
  form.appendChild(nav);

  form.querySelectorAll('input, textarea, select').forEach(input => {
    input.value = answers[input.name] ?? '';
    input.addEventListener('input', () => { answers[input.name] = input.value; });
    input.addEventListener('change', () => { answers[input.name] = input.value; });
  });

  document.getElementById('prevBtn').addEventListener('click', () => { savePageAnswers(); currentPage--; renderPage(); window.scrollTo({top:0,behavior:'smooth'}); });
  const next = document.getElementById('nextBtn');
  if (next) next.addEventListener('click', () => {
    if (!validateCurrentPage()) return;
    savePageAnswers(); currentPage++; renderPage(); window.scrollTo({top:0,behavior:'smooth'});
  });
  form.onsubmit = onSubmit;
}

function renderProgress() {
  const el = document.getElementById('progressArea');
  el.innerHTML = formConfig.pages.map((p, i) => `<div class="progress-step ${i === currentPage ? 'current' : i < currentPage ? 'done' : ''}"><span>${i < currentPage ? '✓' : i + 1}</span><small>${escapeHtml(p.title)}</small></div>`).join('<div class="progress-line"></div>');
}

function renderField(q) {
  const wrap = document.createElement('div'); wrap.className = 'field';
  const label = document.createElement('label'); label.setAttribute('for', q.id);
  label.innerHTML = escapeHtml(q.label) + (q.required ? '<span class="req">*</span>' : ''); wrap.appendChild(label);
  let input;
  if (q.type === 'textarea') input = document.createElement('textarea');
  else { input = document.createElement('input'); input.type = ['number','date'].includes(q.type) ? q.type : 'text'; }
  input.id = q.id; input.name = q.id; input.required = !!q.required;
  wrap.appendChild(input); return wrap;
}

function savePageAnswers() {
  const form = document.getElementById('checklistForm');
  for (const [k,v] of new FormData(form).entries()) answers[k] = v;
}

function validateCurrentPage() {
  savePageAnswers();
  const missing = getPageQuestions(formConfig.pages[currentPage].id).filter(q => q.required && !String(answers[q.id] ?? '').trim());
  if (missing.length) {
    showMessage(`請先完成必填欄位：${missing.map(q => q.label).join('、')}`, 'error');
    const first = document.getElementById(missing[0].id); if (first) first.focus();
    return false;
  }
  return true;
}

async function onSubmit(e) {
  e.preventDefault();
  if (!validateCurrentPage()) return;
  const btn = document.getElementById('submitBtn'); btn.disabled = true; btn.textContent = '送出中...';
  try {
    const res = await fetch('/api/submissions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(answers) });
    const result = await res.json();
    if (!res.ok) throw new Error((result.error || '送出失敗') + (result.missing ? `（${result.missing.join('、')}）` : ''));
    showMessage(`交接清冊已成功送出！單號：${result.id}`, 'success');
    answers = {}; currentPage = 0; renderPage(); window.scrollTo({top:0,behavior:'smooth'});
  } catch (err) { showMessage(err.message || '網路發生問題，請稍後再試。', 'error'); btn.disabled = false; btn.textContent = '確認並送出交接清冊 ✓'; }
}

function showMessage(text, type) { document.getElementById('msgArea').innerHTML = `<div class="msg ${type}">${escapeHtml(text)}</div>`; }
function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

loadForm().catch(err => showMessage(err.message, 'error'));
