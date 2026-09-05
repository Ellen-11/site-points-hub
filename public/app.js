const $ = s => document.querySelector(s);
let accounts = []; let tags = []; let dashboardData = null; let activeFilter = ''; let checkinFilter = '';

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
  $('#uncheckedCount').textContent = data.accounts.filter(x => x.checkinState === 'unchecked').length;
  const allTags = [...new Set(data.tags || [])].sort((a, b) => a.localeCompare(b));
  const enabledTags = new Set(data.pollTags || []);
  $('#gatewayTags').innerHTML = allTags.map(tag => `<span class="tag-item"><button class="tag-toggle ${enabledTags.has(tag) ? 'active' : 'ghost'}" data-tag="${esc(tag)}" onclick="toggleGatewayTag(this.dataset.tag,${!enabledTags.has(tag)})">${enabledTags.has(tag) ? '✓ ' : ''}${esc(tag)}</button><button class="tag-delete" data-tag="${esc(tag)}" onclick="deleteTag(this.dataset.tag)" title="删除标签">×</button></span>`).join('') || '<span class="hint">先在这里添加一个标签。</span>';
  $('#filterTags').innerHTML = `<button class="tag-toggle ${activeFilter ? 'ghost' : 'active'}" onclick="setTagFilter('')">全部</button>` + allTags.map(tag => `<button class="tag-toggle ${activeFilter === tag ? 'active' : 'ghost'}" data-tag="${esc(tag)}" onclick="setTagFilter(this.dataset.tag)">${esc(tag)}</button>`).join('');
  $('#filterCheckin').innerHTML = [['', '全部'], ['checked', '已签到'], ['unchecked', '未签到']].map(([value, label]) => `<button class="tag-toggle ${checkinFilter === value ? 'active' : 'ghost'}" onclick="setCheckinFilter('${value}')">${label}</button>`).join('');
  const visibleAccounts = data.accounts.filter(account => (!activeFilter || (account.tags || []).includes(activeFilter)) && (!checkinFilter || account.checkinState === checkinFilter));
  $('#cards').innerHTML = visibleAccounts.length ? visibleAccounts.map(a => `
    <article class="card" draggable="true" ondragstart="startAccountDrag(event,'${a.id}')" ondragover="dragAccountOver(event)" ondragleave="this.classList.remove('drag-over')" ondrop="dropAccount(event,'${a.id}')" ondragend="endAccountDrag(event)">
      <div class="top"><strong>${esc(a.name)}</strong><span class="drag-handle" title="拖动排序">⋮⋮</span><span class="checkin-badge ${a.checkinState === 'checked' ? 'checked' : 'unchecked'}" title="${a.checkinDate ? '记录日期 ' + esc(a.checkinDate) : '尚未记录签到'}">${a.checkinState === 'checked' ? '已签到' : '未签到'}</span><span class="status ${a.lastStatus === 'error' ? 'error' : ''}">${a.lastStatus === 'error' ? '异常' : a.lastStatus === 'ok' ? '正常' : '未运行'}</span></div>
      <div class="site-tags">${(a.tags || []).map(tag => `<span>${esc(tag)}</span>`).join('') || '<span class="empty-tag">未设置标签</span>'}</div>
      <a class="site-link" href="${esc(a.baseUrl)}" target="_blank" rel="noopener noreferrer">打开站点 ↗</a>
      <div class="balance">${esc(a.balance ?? '—')}</div>
      <div class="model-box"><strong>${esc(a.modelName || '尚未选择模型')}</strong><span>${esc(priceWithEstimate(a.modelPrice) || (a.hasApiKey ? '点击选择模型并查看价格' : '请先编辑并填写 API Key'))}</span></div>
      <p class="meta">${a.lastError ? esc(a.lastError) : a.checkinState === 'checked' && a.checkinDate ? '签到记录于 ' + esc(a.checkinDate) : a.lastCheckedAt ? '更新于 ' + new Date(a.lastCheckedAt).toLocaleString() : '等待首次刷新'}</p>
      <div class="card-actions">${a.checkinState === 'checked' ? `<button class="secondary" onclick="recordCheckin('${a.id}',false)">改记未签到</button>` : `<button class="secondary" onclick="recordCheckin('${a.id}',true)">记录已签到</button>`}<button onclick="run('${a.id}','poll')">刷新</button><button class="ghost" onclick="testConnection('${a.id}',this)">测试连接</button><button class="ghost" onclick="openTagPicker('${a.id}')">选择标签</button><button class="ghost" onclick="openModels('${a.id}')">选择模型</button><button class="ghost" onclick="testModel('${a.id}',this)">测试模型</button><button class="ghost" onclick="edit('${a.id}')">编辑</button><button class="ghost" onclick="removeAccount('${a.id}')">删除</button></div>
    </article>`).join('') : `<article class="panel"><p>${activeFilter || checkinFilter ? '当前筛选条件下没有站点。' : '还没有站点，先添加一个。'}</p></article>`;
}

window.showView = view => {
  $('#dashboardView').classList.toggle('hidden', view !== 'dashboard');
  $('#logsView').classList.toggle('hidden', view !== 'logs');
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'logs') loadLogs();
};

window.loadLogs = async () => {
  try {
    const query = new URLSearchParams({ action: $('#logAction').value, status: $('#logStatus').value, accountId: $('#logAccount').value });
    const data = await api(`/api/logs?${query}`);
    const selected = $('#logAccount').value;
    $('#logAccount').innerHTML = '<option value="">全部站点</option>' + data.accounts.map(account => `<option value="${esc(account.id)}">${esc(account.name)}</option>`).join('');
    $('#logAccount').value = selected;
    $('#logResults').innerHTML = data.runs.map(run => {
      const action = run.action === 'gateway' ? '网关' : run.action === 'checkin' ? '签到' : '刷新';
      const result = run.status === 'ok' ? '成功' : '失败';
      const usage = Number.isFinite(run.totalTokens) ? `输入 ${run.inputTokens || 0} · 输出 ${run.outputTokens || 0} · 缓存 ${run.cachedTokens || 0} · 总计 ${run.totalTokens}` : '';
      const details = [run.modelName, usage, Number.isFinite(run.latencyMs) ? `${run.latencyMs} ms` : '', run.statusCode ? `HTTP ${run.statusCode}` : ''].filter(Boolean).join(' · ');
      return `<article><time>${new Date(run.startedAt).toLocaleString()}</time><strong>${esc(run.accountName)}</strong><span class="log-kind">${action}</span><span class="${run.status}">${result}</span><p>${esc(details || run.message || '—')}</p></article>`;
    }).join('') || '<p>当前筛选下没有日志。</p>';
  } catch (error) { alert(`日志加载失败：${error.message}`); }
};
for (const selector of ['#logAction', '#logStatus', '#logAccount']) document.addEventListener('change', event => { if (event.target.matches(selector)) loadLogs(); });

window.setTagFilter = tag => { activeFilter = tag; render(dashboardData); };
window.setCheckinFilter = state => { checkinFilter = state; render(dashboardData); };
function currentVisible() {
  return accounts.filter(account => (!activeFilter || (account.tags || []).includes(activeFilter)) && (!checkinFilter || account.checkinState === checkinFilter));
}
let draggedAccount = '';
window.startAccountDrag = (event, id) => { draggedAccount = id; event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('dragging'); };
window.dragAccountOver = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('drag-over'); };
window.endAccountDrag = event => { event.currentTarget.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(card => card.classList.remove('drag-over')); };
window.dropAccount = async (event, targetId) => {
  event.preventDefault(); event.currentTarget.classList.remove('drag-over');
  if (!draggedAccount || draggedAccount === targetId) return;
  const visible = currentVisible();
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
$('#add').onclick = () => { const form = $('#accountForm'); form.reset(); form.elements.id.value = ''; $('#accountSaveError').textContent = ''; toggleFields(); $('#editor').showModal(); };
$('#cancel').onclick = () => $('#editor').close();
function toggleFields() { const custom = $('#panelType').value === 'generic'; $('#simpleFields').classList.toggle('hidden', custom); $('#advancedFields').classList.toggle('hidden', !custom); }
$('#panelType').onchange = toggleFields;
$('#accountForm').onsubmit = async event => {
  event.preventDefault();
  const button = $('#accountSaveButton');
  $('#accountSaveError').textContent = '';
  const values = Object.fromEntries(new FormData(event.target));
  if (values.panelType === 'generic') values.credential = values.genericCredential;
  delete values.genericCredential;
  button.disabled = true; button.textContent = '正在保存…';
  try {
    await api('/api/accounts', { method: 'POST', body: JSON.stringify(values) });
    $('#editor').close(); await load();
  } catch (error) { $('#accountSaveError').textContent = error.message; }
  finally { button.disabled = false; button.textContent = '保存'; }
};

window.edit = id => { const account = accounts.find(x => x.id === id), form = $('#accountForm'); form.reset(); $('#accountSaveError').textContent = ''; Object.entries(account).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; }); toggleFields(); $('#editor').showModal(); };
window.run = async (id, action) => { try { await api(`/api/accounts/${id}/${action}`, { method: 'POST' }); } catch (error) { alert(error.message); } load(); };
window.recordCheckin = async (id, checked) => {
  try { await api(`/api/accounts/${id}/checkin-record`, { method: 'POST', body: JSON.stringify({ checked }) }); load(); }
  catch (error) { alert(error.message); }
};
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
let pickingAccount = ''; let pickedModels = [];
let activeBilling = localStorage.getItem('modelBilling') === 'token' ? 'token' : 'call';
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
window.setBilling = billing => { activeBilling = billing; localStorage.setItem('modelBilling', billing); document.querySelectorAll('.billing-button').forEach(button => { const active = button.dataset.billing === billing; button.classList.toggle('active', active); button.classList.toggle('ghost', !active); }); renderCategories(); };
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
    setBilling(activeBilling);
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
window.testConnection = async (id, button) => {
  const original = button.textContent;
  button.disabled = true; button.textContent = '测试中…';
  try {
    const result = await api(`/api/accounts/${id}/models`, { method: 'POST' });
    const models = result.models || [];
    const account = accounts.find(x => x.id === id);
    const selected = account?.modelName || '';
    const guess = selected ? `\n所选模型 ${selected} ${models.some(model => model.name === selected) ? '在模型列表中，连接大概率可用' : '不在模型列表中，可能已下线或名称不符'}` : '\n尚未选择模型；列表可用即可正常选择';
    alert(`连接成功：读取到 ${models.length} 个模型\n示例：${models.slice(0, 6).map(model => model.name).join('、')}${guess}`);
  } catch (error) { alert(`连接失败：${error.message}`); }
  finally { button.disabled = false; button.textContent = original; }
};
$('#closeModels').onclick = () => $('#modelPicker').close();
window.toggleGatewayTag = async (tag, enabled) => { try { await api('/api/gateway-tags', { method: 'POST', body: JSON.stringify({ tag, enabled }) }); load(); } catch (error) { alert(error.message); } };
window.deleteTag = async tag => {
  if (!confirm(`确定删除标签“${tag}”吗？它会从所有站点中移除。`)) return;
  await api(`/api/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
  if (activeFilter === tag) activeFilter = '';
  await load();
};
window.removeAccount = async id => { if (confirm('确定删除这个站点？')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); load(); } };
async function markBatch(checked, button) {
  const targets = currentVisible();
  if (!targets.length) return alert('当前筛选下没有可记录的站点。');
  const original = button.textContent; button.disabled = true;
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const account = targets[index];
      button.textContent = `${index + 1}/${targets.length} ${account.name}`;
      $('#batchProgress').textContent = `正在${checked ? '记录已签到' : '记录未签到'} ${index + 1}/${targets.length}：${account.name}`;
      await api(`/api/accounts/${account.id}/checkin-record`, { method: 'POST', body: JSON.stringify({ checked }) });
    }
    $('#batchProgress').textContent = `记录完成：共 ${targets.length} 个站点。`;
    await load();
  } finally { button.disabled = false; button.textContent = original; }
}
$('#checkinAll').onclick = event => markBatch(true, event.currentTarget);
$('#uncheckAll').onclick = event => markBatch(false, event.currentTarget);
load();
