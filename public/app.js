const $ = s => document.querySelector(s);
let accounts = [];

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '请求失败');
  return data;
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function priceWithEstimate(price = {}) {
  if (!price?.text) return '';
  if (price.type !== 'per_call') return price.text;
  if (price.estimatedCalls === 'unlimited') return `${price.text} · 预计不限次数`;
  if (Number.isInteger(price.estimatedCalls)) return `${price.text} · 预计还可 ${price.estimatedCalls.toLocaleString()} 次`;
  return `${price.text} · 刷新余额后估算`;
}

async function load() {
  try {
    const data = await api('/api/dashboard');
    accounts = data.accounts;
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
    render(data);
  } catch {
    accounts = [];
    $('#login').classList.remove('hidden');
    $('#app').classList.add('hidden');
    $('#logout').classList.add('hidden');
  }
}

function render(data) {
  $('#siteCount').textContent = data.accounts.length;
  $('#okCount').textContent = data.accounts.filter(x => x.lastStatus === 'ok').length;
  $('#errorCount').textContent = data.accounts.filter(x => x.lastStatus === 'error').length;
  $('#cards').innerHTML = data.accounts.length ? data.accounts.map(a => `
    <article class="card">
      <div class="top"><strong>${esc(a.name)}</strong><span class="status ${a.lastStatus === 'error' ? 'error' : ''}">${a.lastStatus === 'error' ? '异常' : a.lastStatus === 'ok' ? '正常' : '未运行'}</span></div>
      <label class="poll-toggle"><input type="checkbox" ${a.pollEnabled !== false ? 'checked' : ''} onchange="togglePoll('${a.id}',this.checked)"> 参与轮询</label>
      <a class="site-link" href="${esc(a.baseUrl)}" target="_blank" rel="noopener noreferrer">打开站点 ↗</a>
      <div class="balance">${esc(a.balance ?? '—')}</div>
      <div class="model-box"><strong>${esc(a.modelName || '尚未选择模型')}</strong><span>${esc(priceWithEstimate(a.modelPrice) || (a.hasApiKey ? '点击选择模型并查看价格' : '请先编辑并填写 API Key'))}</span></div>
      <p class="meta">${a.lastError ? esc(a.lastError) : a.lastCheckinMessage ? esc(a.lastCheckinMessage) : a.lastCheckedAt ? '更新于 ' + new Date(a.lastCheckedAt).toLocaleString() : '等待首次刷新'}</p>
      <div class="card-actions"><button onclick="run('${a.id}','poll')">刷新</button><button class="secondary" onclick="run('${a.id}','checkin')">签到</button><button class="ghost" onclick="openModels('${a.id}')">选择模型</button><button class="ghost" onclick="testModel('${a.id}',this)">测试模型</button><button class="ghost" onclick="edit('${a.id}')">编辑</button><button class="ghost" onclick="removeAccount('${a.id}')">删除</button></div>
    </article>`).join('') : '<article class="panel"><p>还没有站点，先添加一个。</p></article>';
  $('#runs').innerHTML = data.runs.length ? data.runs.map(r => {
    const account = data.accounts.find(x => x.id === r.accountId);
    const label = r.status === 'already' ? '已签到' : r.status === 'ok' ? '成功' : '失败';
    return `<div><span>${esc(account?.name || '已删除站点')}</span><span>${r.action === 'checkin' ? '签到' : '轮询'}</span><span class="${r.status}">${label}</span><span>${esc(r.message || new Date(r.startedAt).toLocaleString())}</span></div>`;
  }).join('') : '<p>暂无运行记录</p>';
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter || event.target.querySelector('button');
  button.disabled = true;
  button.textContent = '正在登录…';
  $('#loginError').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: new FormData(event.target).get('password') }) });
    await load();
  } catch (error) { $('#loginError').textContent = error.message; }
  finally { button.disabled = false; button.textContent = '进入控制台'; }
};

$('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.reload(); };
$('#add').onclick = () => { const form = $('#accountForm'); form.reset(); form.elements.id.value = ''; toggleFields(); $('#editor').showModal(); };
$('#cancel').onclick = () => $('#editor').close();
function toggleFields() { const custom = $('#panelType').value === 'generic'; $('#simpleFields').classList.toggle('hidden', custom); $('#advancedFields').classList.toggle('hidden', !custom); }
$('#panelType').onchange = toggleFields;
$('#accountForm').onsubmit = async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  if (values.panelType === 'generic') values.credential = values.genericCredential;
  delete values.genericCredential;
  await api('/api/accounts', { method: 'POST', body: JSON.stringify(values) });
  $('#editor').close(); load();
};

window.edit = id => { const account = accounts.find(x => x.id === id), form = $('#accountForm'); form.reset(); Object.entries(account).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; }); toggleFields(); $('#editor').showModal(); };
window.run = async (id, action) => { try { await api(`/api/accounts/${id}/${action}`, { method: 'POST' }); } catch (error) { alert(error.message); } load(); };
let pickingAccount = ''; let pickedModels = []; let activeBilling = 'call';
function showCategory(category) {
  document.querySelectorAll('.category-button').forEach(button => button.classList.toggle('active', button.dataset.category === category));
  const models = pickedModels.filter(model => model.billing === activeBilling && model.category === category);
  $('#modelChoices').innerHTML = models.map(model => {
    const estimate = model.estimatedCalls === 'unlimited' ? ' · 预计不限次数' : Number.isInteger(model.estimatedCalls) ? ` · 预计还可 ${model.estimatedCalls.toLocaleString()} 次` : ' · 刷新余额后估算';
    return `<button class="model-choice" data-model="${esc(model.name)}" onclick="chooseModel(this.dataset.model)"><span>${esc(model.name)}</span><strong>${esc(model.text + (model.billing === 'call' ? estimate : ''))}</strong></button>`;
  }).join('') || '<p>这个分类没有模型。</p>';
}
function renderCategories() {
  const visible = pickedModels.filter(model => model.billing === activeBilling);
  const categories = [...new Set(visible.map(model => model.category))];
  $('#modelCategories').innerHTML = categories.map(category => `<button class="category-button ghost" data-category="${esc(category)}" onclick="showCategory('${esc(category)}')">${esc(category)} <small>${visible.filter(model => model.category === category).length}</small></button>`).join('') || `<p>没有找到可用的${activeBilling === 'call' ? '按次' : '按量'}模型。</p>`;
  $('#modelChoices').innerHTML = '';
  if (categories.length) showCategory(categories[0]);
}
window.setBilling = billing => { activeBilling = billing; document.querySelectorAll('.billing-button').forEach(button => { const active = button.dataset.billing === billing; button.classList.toggle('active', active); button.classList.toggle('ghost', !active); }); renderCategories(); };
window.openModels = async id => {
  pickingAccount = id;
  const account = accounts.find(x => x.id === id);
  if (!account?.hasApiKey) return alert('请先编辑站点并填写 API Key');
  $('#modelPickerTitle').textContent = `${account.name} · 选择模型`;
  $('#modelCategories').innerHTML = '<p>正在拉取模型和价格…</p>';
  $('#modelChoices').innerHTML = '';
  $('#modelPicker').showModal();
  try {
    pickedModels = (await api(`/api/accounts/${id}/models`, { method: 'POST' })).models;
    activeBilling = 'call';
    setBilling('call');
  } catch (error) { $('#modelCategories').innerHTML = `<p class="error">${esc(error.message)}</p>`; }
};
window.showCategory = showCategory;
window.chooseModel = async model => { await api(`/api/accounts/${pickingAccount}/model`, { method: 'POST', body: JSON.stringify({ model }) }); $('#modelPicker').close(); load(); };
window.testModel = async (id, button) => {
  const original = button.textContent;
  button.disabled = true; button.textContent = '测试中…';
  try {
    const result = await api(`/api/accounts/${id}/model-test`, { method: 'POST' });
    alert(`模型连接正常：${result.model}\n响应耗时：${result.latencyMs} ms\n本次未生成内容，不消耗模型额度。`);
  } catch (error) { alert(`模型连接失败：${error.message}`); }
  finally { button.disabled = false; button.textContent = original; }
};
$('#closeModels').onclick = () => $('#modelPicker').close();
window.togglePoll = async (id, enabled) => { try { await api(`/api/accounts/${id}/polling`, { method: 'POST', body: JSON.stringify({ enabled }) }); } catch (error) { alert(error.message); load(); } };
window.removeAccount = async id => { if (confirm('确定删除这个站点？')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); load(); } };
$('#pollAll').onclick = async () => { await api('/api/run-all/poll', { method: 'POST' }); load(); };
$('#checkinAll').onclick = async () => { await api('/api/run-all/checkin', { method: 'POST' }); load(); };
load();
