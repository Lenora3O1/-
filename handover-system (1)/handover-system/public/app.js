async function loadForm() {
  const res = await fetch('/api/questions');
  const questions = await res.json();

  // 依 section 分組，維持原本順序
  const sections = [];
  const map = {};
  for (const q of questions) {
    const key = q.section || '其他';
    if (!map[key]) {
      map[key] = { title: key, questions: [] };
      sections.push(map[key]);
    }
    map[key].questions.push(q);
  }

  const form = document.getElementById('checklistForm');
  form.innerHTML = '';

  for (const sec of sections) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const h = document.createElement('div');
    h.className = 'section-title';
    h.textContent = sec.title;
    panel.appendChild(h);

    for (const q of sec.questions) {
      panel.appendChild(renderField(q));
    }
    form.appendChild(panel);
  }

  const submitWrap = document.createElement('div');
  submitWrap.innerHTML = `<button type="submit">送出交接清冊</button>`;
  form.appendChild(submitWrap);

  form.addEventListener('submit', onSubmit);
}

function renderField(q) {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('label');
  label.setAttribute('for', q.id);
  label.innerHTML = q.label + (q.required ? '<span class="req">*</span>' : '');
  wrap.appendChild(label);

  let input;
  if (q.type === 'textarea') {
    input = document.createElement('textarea');
  } else {
    input = document.createElement('input');
    input.type = q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text';
  }
  input.id = q.id;
  input.name = q.id;
  if (q.required) input.required = true;

  wrap.appendChild(input);
  return wrap;
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = {};
  for (const [k, v] of formData.entries()) data[k] = v;

  const msgArea = document.getElementById('msgArea');
  msgArea.innerHTML = '';

  const submitBtn = form.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = '送出中...';

  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (!res.ok) {
      msgArea.innerHTML = `<div class="msg error">送出失敗：${result.error || '未知錯誤'}${
        result.missing ? '（' + result.missing.join('、') + '）' : ''
      }</div>`;
    } else {
      window.scrollTo(0, 0);
      msgArea.innerHTML = `<div class="msg success">交接清冊已成功送出，感謝您的填寫！（單號：${result.id}）</div>`;
      form.reset();
    }
  } catch (err) {
    msgArea.innerHTML = `<div class="msg error">網路發生問題，請稍後再試。</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '送出交接清冊';
  }
}

loadForm();
