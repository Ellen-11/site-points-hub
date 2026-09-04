const $ = s => document.querySelector(s);
let accounts = []; let tags = []; let dashboardData = null; let activeFilter = '';

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
    tags = data.tags || [];
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
  dashboardData = data;
  $('#siteCount').textContent = data.accounts.length;
  $('#okCount').textContent = data.accounts.filter(x => x.lastStatus === 'ok').length;
  $('#errorCount').textContent = data.accounts.filter(x => x.lastStatus === 'error').length;
  const allTags = [...new Set(data.tags || [])].sort((a, b) => a.localeCompare(b));
  const enabledTags = new Set(data.pollTags || []);
  $('#pollTags').innerHTML = allTags.map(tag => `<span class="tag-item"><button class="tag-toggle ${enabledTags.has(tag) ? 'active' : 'ghost'}" data-tag="${esc(tag)}" onclick="togglePollTag(this.dataset.tag,${!enabledTags.has(tag)})">${enabledTags.has(tag) ? '✓ ' : ''}${esc(tag)}</button><button class="tag-delete" data-tag="${esc(tag)}" onclick="deleteTag(this.dataset.tag)" title="删除标签">×</button></span>`).join('') || '<span class="hint">先在这里添加一个标签。</span>';
  $('#filterTags').innerHTML = `<button class="tag-toggle ${activeFilter ? 'ghost' : 'active'}" onclick="setTagFilter('')">全部</button>` + allTags.map(tag => `<button class="tag-toggle ${activeFilter === tag ? 'active' : 'ghost'}" data-tag="${esc(tag)}" onclick="setTagFilter(this.dataset.tag)">${esc(tag)}</button>`).join('');
  const visibleAccounts = activeFilter ? data.accounts.filter(account => (account.tags || []).includes(activeFilter)) : data.accounts;
  $('#cards').innerHTML = visibleAccounts.length ? visibleAccounts.map(a => `
    <article class="card" draggable="true" ondragstart="startAccountDrag(event,'${a.id}')" ondragover="dragAccountOver(event)" ondragleave="this.classList.remove('drag-over')" ondrop="dropAccount(event,'${a.id}')" ondragend="endAccountDrag(event)">
      <div class="top"><strong>${esc(a.name)}</strong><span class="drag-handle" title="拖动排序">⋮⋮</span><span class="status ${a.lastStatus === 'error' ? 'error' : ''}">${a.lastStatus === 'error' ? '异常' : a.lastStatus === 'ok' ? '正常' : '未运行'}</span></div>
      <div class="site-tags">${(a.tags || []).map(tag => `<span>${esc(tag)}</span>`).join('') || '<span class="empty-tag">未设置标签</span>'}</div>
      <a class="site-link" href="${esc(a.baseUrl)}" target="_blank" rel="noopener noreferrer">打开站点 ↗</a>
      <div class="balance">${esc(a.balance ?? '—')}</div>
      <div class="model-box"><strong>${esc(a.modelName || '尚未选择模型')}</strong><span>${esc(priceWithEstimate(a.modelPrice) || (a.hasApiKey ? '点击选择模型并查看价格' : '请先编辑并填写 API Key'))}</span></div>
      <p class="meta">${a.lastError ? esc(a.lastError) : a.lastCheckinMessage ? esc(a.lastCheckinMessage) : a.lastCheckedAt ? '更新于 ' + new Date(a.lastCheckedAt).toLocaleString() : '等待首次刷新'}</p>
      <div class="card-actions"><button onclick="run('${a.id}','poll')">刷新</button><button class="secondary" onclick="run('${a.id}','checkin')">签到</button><button class="ghost" onclick="openTagPicker('${a.id}')">选择标签</button><button class="ghost" onclick="openModels('${a.id}')">选择模型</button><button class="ghost" onclick="testModel('${a.id}',this)">测试模型</button><button class="ghost" onclick="edit('${a.id}')">编辑</button><button class="ghost" onclick="removeAccount('${a.id}')">删除</button></div>
    </article>`).join('') : `<article class="panel"><p>${activeFilter ? '这个标签下还没有站点。' : '还没有站点，先添加一个。'}</p></article>`;
  $('#runs').innerHTML = data.runs.length ? data.runs.map(r => {
    const account = data.accounts.find(x => x.id === r.accountId);
    const label = r.status === 'already' ? '已签到' : r.status === 'ok' ? '成功' : '失败';
    return `<div><span>${esc(account?.name || '已删除站点')}</span><span>${r.action === 'checkin' ? '签到' : '轮询'}</span><span class="${r.status}">${label}</span><span>${esc(r.message || new Date(r.startedAt).toLocaleString())}</span></div>`;
  }).join('') : '<p>暂无运行记录</p>';
}

window.setTagFilter = tag => { activeFilter = tag; render(dashboardData); };
let draggedAccount = '';
window.startAccountDrag = (event, id) => { draggedAccount = id; event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('dragging'); };
window.dragAccountOver = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('drag-over'); };
window.endAccountDrag = event => { event.currentTarget.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(card => card.classList.remove('drag-over')); };
window.dropAccount = async (event, targetId) => {
  event.preventDefault(); event.currentTarget.classList.remove('drag-over');
  if (!draggedAccount || draggedAccount === targetId) return;
  const visible = activeFilter ? accounts.filter(account => (account.tags || []).includes(activeFilter)) : [...accounts];
  const from = visible.findIndex(account => account.id === draggedAccount); const target = visible.findIndex(account => account.id === targetId);
  if (from < 0 || target < 0) return;
  const [moved] = visible.splice(from, 1); const rect = event.currentTarget.getBoundingClientRect();
  let insertAt = visible.findIndex(account => account.id === targetId);
  if (event.clientY > rect.top + rect.height / 2) insertAt += 1;
  visible.splice(insertAt, 0, moved); draggedAccount = '';
  await api('/api/accounts/order', { method: 'POST', body: JSON.stringify({ orderedIds: visible.map(account => account.id) }) });
  await load();
};

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
$('#addTagForm').onsubmit = async event => {
  event.preventDefault(); const form = event.target; const tag = new FormData(form).get('tag');
  try { await api('/api/tags', { method: 'POST', body: JSON.stringify({ tag }) }); form.reset(); load(); }
  catch (error) { alert(error.message); }
};
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
let taggingAccount = '';
window.openTagPicker = id => {
  taggingAccount = id; const account = accounts.find(x => x.id === id); const selected = new Set(account.tags || []);
  $('#tagPickerTitle').textContent = `${account.name} · 选择标签`;
  $('#tagChoices').innerHTML = tags.map(tag => `<label><input type="checkbox" name="tags" value="${esc(tag)}" ${selected.has(tag) ? 'checked' : ''}> ${esc(tag)}</label>`).join('') || '<p>还没有标签，请先在页面顶部添加。</p>';
  $('#tagPicker').showModal();
};
$('#tagPickerForm').onsubmit = async event => {
  event.preventDefault(); const selected = new FormData(event.target).getAll('tags');
  await api(`/api/accounts/${taggingAccount}/tags`, { method: 'POST', body: JSON.stringify({ tags: selected }) });
  $('#tagPicker').close(); load();
};
$('#closeTags').onclick = () => $('#tagPicker').close();
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
    alert(`模型调用成功：${result.model}\n响应耗时：${result.latencyMs} ms\n本次已真实调用，会计入上游使用记录并消耗相应额度。`);
  } catch (error) { alert(`模型连接失败：${error.message}`); }
  finally { button.disabled = false; button.textContent = original; }
};
$('#closeModels').onclick = () => $('#modelPicker').close();
window.togglePollTag = async (tag, enabled) => { try { await api('/api/poll-tags', { method: 'POST', body: JSON.stringify({ tag, enabled }) }); load(); } catch (error) { alert(error.message); } };
window.deleteTag = async tag => {
  if (!confirm(`确定删除标签“${tag}”吗？它会从所有站点中移除。`)) return;
  await api(`/api/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
  if (activeFilter === tag) activeFilter = '';
  await load();
};
window.removeAccount = async id => { if (confirm('确定删除这个站点？')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); load(); } };
async function runBatch(action, button) {
  const targets = activeFilter ? accounts.filter(account => (account.tags || []).includes(activeFilter)) : [...accounts];
  if (!targets.length) return alert('当前筛选下没有可执行的站点。');
  const original = button.textContent; let ok = 0; let failed = 0; button.disabled = true;
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const account = targets[index];
      button.textContent = `${index + 1}/${targets.length} ${account.name}`;
      $('#batchProgress').textContent = `正在${action === 'checkin' ? '签到' : '刷新'} ${index + 1}/${targets.length}：${account.name}`;
      try { const result = await api(`/api/accounts/${account.id}/${action}`, { method: 'POST' }); result.lastStatus === 'error' ? failed += 1 : ok += 1; }
      catch { failed += 1; }
    }
    $('#batchProgress').textContent = `执行完成：成功 ${ok} 个，失败 ${failed} 个。`;
    await load();
  } finally { button.disabled = false; button.textContent = original; }
}
$('#pollAll').onclick = event => runBatch('poll', event.currentTarget);
$('#checkinAll').onclick = event => runBatch('checkin', event.currentTarget);
load();
