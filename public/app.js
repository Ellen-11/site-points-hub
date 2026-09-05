const $ = s => document.querySelector(s);
let accounts = []; let tags = []; let dashboardData = null; let activeFilter = '';
let priceAlertData = null; let inviteAlertData = null;

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

function setPriceAlertBadge(count = 0) {
  const badge = $('#priceAlertBadge');
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', !count);
}

function setInviteAlertBadge(count = 0) {
  const badge = $('#inviteAlertBadge');
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', !count);
}

async function refreshPriceAlertBadge() {
  if ($('#app').classList.contains('hidden') || !$('#priceAlertsView').classList.contains('hidden')) return;
  try { setPriceAlertBadge((await api('/api/price-alerts')).unreadCount || 0); } catch {}
}
async function refreshInviteAlertBadge() {
  if ($('#app').classList.contains('hidden') || !$('#inviteAlertsView').classList.contains('hidden')) return;
  try { setInviteAlertBadge((await api('/api/invite-alerts')).unreadCount || 0); } catch {}
}
setInterval(() => { refreshPriceAlertBadge(); refreshInviteAlertBadge(); }, 60000);

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
  setPriceAlertBadge(data.priceAlertUnreadCount || 0);
  setInviteAlertBadge(data.inviteAlertUnreadCount || 0);
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
      ${a.refreshMode === 'browser' ? `<span class="browser-badge">服务器浏览器登录态${a.browserLoginAction ? ` · 自动点 ${esc(a.browserLoginAction)}` : ''}</span>` : ''}
      <div class="balance">${esc(a.balance ?? '—')}</div>
      <div class="model-box"><strong>${esc(a.modelName || '尚未选择模型')}</strong><span>${esc(priceWithEstimate(a.modelPrice) || (a.hasApiKey ? '点击选择模型并查看价格' : '请先编辑并填写 API Key'))}</span></div>
      <p class="meta">${a.lastError ? esc(a.lastError) : a.lastCheckinMessage ? esc(a.lastCheckinMessage) : a.lastCheckedAt ? '更新于 ' + new Date(a.lastCheckedAt).toLocaleString() : '等待首次刷新'}</p>
      <div class="card-actions"><button onclick="run('${a.id}','poll')">刷新</button><button class="secondary" onclick="run('${a.id}','checkin')">签到</button><button class="ghost" onclick="openTagPicker('${a.id}')">选择标签</button><button class="ghost" onclick="openModels('${a.id}')">选择模型</button><button class="ghost" onclick="testModel('${a.id}',this)">测试模型</button>${a.refreshMode === 'browser' ? `<button class="ghost" onclick="openServerBrowser('${a.id}')">浏览器登录</button>` : ''}<button class="ghost" onclick="edit('${a.id}')">编辑</button><button class="ghost" onclick="removeAccount('${a.id}')">删除</button></div>
    </article>`).join('') : `<article class="panel"><p>${activeFilter ? '这个标签下还没有站点。' : '还没有站点，先添加一个。'}</p></article>`;
}

window.showView = view => {
  $('#dashboardView').classList.toggle('hidden', view !== 'dashboard');
  $('#statsView').classList.toggle('hidden', view !== 'stats');
  $('#logsView').classList.toggle('hidden', view !== 'logs');
  $('#priceAlertsView').classList.toggle('hidden', view !== 'priceAlerts');
  $('#inviteAlertsView').classList.toggle('hidden', view !== 'inviteAlerts');
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'stats') loadStats();
  if (view === 'logs') loadLogs();
  if (view === 'priceAlerts') loadPriceAlerts();
  if (view === 'inviteAlerts') loadInviteAlerts();
};

window.renderInviteAlerts = () => {
  if (!inviteAlertData) return;
  const siteSelect = $('#inviteSiteFilter');
  const selectedSite = siteSelect.value;
  siteSelect.innerHTML = '<option value="">全部站点</option>' + (inviteAlertData.sites || []).map(site => `<option value="${esc(site.id)}">${esc(site.name)}</option>`).join('');
  siteSelect.value = selectedSite;
  const activeSite = siteSelect.value;
  const alerts = inviteAlertData.alerts.filter(item => !activeSite || item.accountId === activeSite);
  const counts = (inviteAlertData.counts || []).filter(item => !activeSite || item.accountId === activeSite);
  $('#inviteMonitoredCount').textContent = inviteAlertData.monitoredCount.toLocaleString();
  $('#inviteTotalCount').textContent = inviteAlertData.totalCount.toLocaleString();
  $('#inviteUnreadCount').textContent = inviteAlertData.unreadCount.toLocaleString();
  $('#inviteAlertsUpdatedAt').textContent = inviteAlertData.lastCheckedAt ? `检测于 ${new Date(inviteAlertData.lastCheckedAt).toLocaleString()}` : '尚未检测到邀请字段';
  $('#inviteSiteCounts').innerHTML = counts.map(item => `<article><strong>${esc(item.accountName)}</strong><b>${Number(item.count).toLocaleString()} 人</b><time>${item.checkedAt ? `检测于 ${new Date(item.checkedAt).toLocaleString()}` : '已建立基准'}</time></article>`).join('') || '<p>当前筛选范围内暂无已识别的邀请人数。</p>';
  $('#inviteAlertHistory').innerHTML = alerts.map(item => `<article class="unread"><strong>${esc(item.accountName)}</strong><b class="invite-added">+${Number(item.addedCount).toLocaleString()} 人</b><span>邀请人数 ${Number(item.previousCount).toLocaleString()} → ${Number(item.currentCount).toLocaleString()}</span><time>${new Date(item.detectedAt).toLocaleString()}</time><div class="price-alert-actions"><button class="ghost" onclick="dismissInviteAlert('${esc(item.id)}')">已读</button></div></article>`).join('') || '<p>暂无新增邀请提醒。完成一次余额刷新后会开始记录。</p>';
};

window.loadInviteAlerts = async () => {
  try {
    inviteAlertData = await api('/api/invite-alerts');
    renderInviteAlerts(); setInviteAlertBadge(inviteAlertData.unreadCount || 0);
  } catch (error) { alert(`邀请提醒加载失败：${error.message}`); }
};

window.dismissInviteAlert = async id => {
  try {
    inviteAlertData = await api(`/api/invite-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    renderInviteAlerts(); setInviteAlertBadge(inviteAlertData.unreadCount || 0);
  } catch (error) { alert(`已读操作失败：${error.message}`); }
};

window.clearInviteAlertHistory = async () => {
  if (!confirm('确定清空全部邀请提醒吗？')) return;
  inviteAlertData = await api('/api/invite-alerts', { method: 'DELETE' });
  renderInviteAlerts(); setInviteAlertBadge(0);
};

function usdPerCall(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) return '—';
  if (price === 0) return '$0 / 次';
  return `$${price < 0.0001 ? price.toFixed(8) : price.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} / 次`;
}

window.renderPriceAlerts = () => {
  if (!priceAlertData) return;
  const siteSelect = $('#priceSiteFilter');
  const selectedSite = siteSelect.value;
  siteSelect.innerHTML = '<option value="">全部站点</option>' + (priceAlertData.sites || []).map(site => `<option value="${esc(site.id)}">${esc(site.name)}</option>`).join('');
  siteSelect.value = selectedSite;
  const activeSite = siteSelect.value;
  const activeScope = $('#priceScopeFilter').value;
  const filter = String($('#priceModelFilter').value || '').trim().toLowerCase();
  const alerts = priceAlertData.alerts.filter(item => (!activeSite || item.accountId === activeSite || item.currentAccountId === activeSite) && (!activeScope || (item.scope || 'precise') === activeScope) && (!filter || `${item.comparisonName || ''} ${item.modelName} ${item.currentModelName || ''}`.toLowerCase().includes(filter)));
  $('#priceLeaderCount').textContent = ((priceAlertData.leaders?.length || 0) + (priceAlertData.broadLeaders?.length || 0)).toLocaleString();
  $('#priceUnreadCount').textContent = priceAlertData.unreadCount.toLocaleString();
  $('#priceSiteCount').textContent = (priceAlertData.lastScan?.monitored || 0).toLocaleString();
  $('#priceFailureCount').textContent = (priceAlertData.lastScan?.failed || 0).toLocaleString();
  $('#priceAlertsUpdatedAt').textContent = priceAlertData.lastCheckedAt ? `扫描于 ${new Date(priceAlertData.lastCheckedAt).toLocaleString()}` : '尚未扫描';
  $('#priceScanHint').textContent = priceAlertData.lastScan
    ? `本次成功刷新 ${priceAlertData.lastScan.refreshed}/${priceAlertData.lastScan.monitored} 个站点${priceAlertData.lastScan.failed ? `，${priceAlertData.lastScan.failed} 个失败` : ''}。一个连接符规则可把 gpt-5.5 与 gpt-5.5-free 归为一组；两个连接符规则继续比较 gemini-3.1-pro-high/low。`
    : '两套规则首次扫描都只建立价格基准，不产生提醒。';
  $('#priceAlertHistory').innerHTML = alerts.map(item => {
    const watchText = item.pinned
      ? item.watchStatus === 'missing' ? '当前已消失'
        : `${esc(item.watchMessage || '持续观察中')} · 当前 ${esc(usdPerCall(item.currentPriceUsd))}${item.currentModelName ? ` · ${esc(item.currentModelName)}` : ''}${item.currentAccountName ? ` · ${esc(item.currentAccountName)}` : ''}`
      : '';
    const scopeLabel = item.scope === 'broad' ? '一个连接符' : '两个连接符';
    return `<article class="${item.unread ? 'unread ' : ''}${item.pinned ? 'pinned' : ''}"><strong>${item.pinned ? '<i class="pin-mark">加精</i>' : ''}<i class="comparison-mark">${scopeLabel}</i>${esc(item.comparisonName || item.modelName)}</strong><b class="price-drop">${esc(usdPerCall(item.newPriceUsd))}</b><span>当时最低变体：${esc(item.modelName)}</span><span>${item.kind === 'new' ? '新发现可用最低价' : `<span class="price-old">${esc(usdPerCall(item.oldPriceUsd))}</span> → 降价`}</span><span>${esc(item.accountName)}</span>${watchText ? `<p class="watch-state ${esc(item.watchStatus || 'watching')}">${watchText}</p>` : ''}<time>${new Date(item.detectedAt).toLocaleString()}${item.lastChangedAt ? ` · 最近变化 ${new Date(item.lastChangedAt).toLocaleString()}` : ''}</time><div class="price-alert-actions"><button class="ghost" onclick="togglePriceAlertPin('${esc(item.id)}',${!item.pinned})">${item.pinned ? '取消加精' : '加精'}</button><button class="ghost" onclick="dismissPriceAlert('${esc(item.id)}')">已读</button></div></article>`;
  }).join('') || '<p>暂无降价提醒。</p>';
};

window.loadPriceAlerts = async () => {
  try {
    priceAlertData = await api('/api/price-alerts');
    renderPriceAlerts();
    setPriceAlertBadge(priceAlertData.unreadCount || 0);
  } catch (error) { alert(`降价提醒加载失败：${error.message}`); }
};

window.scanPrices = async () => {
  const button = $('#scanPrices'); const original = button.textContent;
  button.disabled = true; button.textContent = '扫描中…';
  try {
    priceAlertData = await api('/api/price-alerts/scan', { method: 'POST' });
    renderPriceAlerts();
    setPriceAlertBadge(priceAlertData.unreadCount || 0);
  } catch (error) { alert(`价格扫描失败：${error.message}`); }
  finally { button.disabled = false; button.textContent = original; }
};

window.clearPriceAlertHistory = async () => {
  if (!confirm('确定清除全部未加精消息吗？加精观察项会保留。')) return;
  priceAlertData = await api('/api/price-alerts', { method: 'DELETE' });
  renderPriceAlerts(); setPriceAlertBadge(priceAlertData.unreadCount || 0);
};

window.togglePriceAlertPin = async (id, pinned) => {
  try {
    priceAlertData = await api(`/api/price-alerts/${encodeURIComponent(id)}/pin`, { method: 'POST', body: JSON.stringify({ pinned }) });
    renderPriceAlerts(); setPriceAlertBadge(priceAlertData.unreadCount || 0);
  } catch (error) { alert(`加精操作失败：${error.message}`); }
};

window.dismissPriceAlert = async id => {
  try {
    priceAlertData = await api(`/api/price-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    renderPriceAlerts(); setPriceAlertBadge(priceAlertData.unreadCount || 0);
  } catch (error) { alert(`已读操作失败：${error.message}`); }
};

window.loadStats = async () => {
  try {
    const range = Number($('#trendRange').value || 7);
    const query = new URLSearchParams({ days: range, accountId: $('#statsAccount').value, modelName: $('#statsModel').value });
    const data = await api(`/api/stats?${query}`);
    const selectedAccount = $('#statsAccount').value; const selectedModel = $('#statsModel').value;
    $('#statsAccount').innerHTML = '<option value="">全部站点</option>' + data.filters.accounts.map(account => `<option value="${esc(account.id)}">${esc(account.name)}</option>`).join('');
    $('#statsModel').innerHTML = '<option value="">全部模型</option>' + data.filters.models.map(model => `<option value="${esc(model)}">${esc(model)}</option>`).join('');
    $('#statsAccount').value = selectedAccount; $('#statsModel').value = selectedModel;
    const accountLabel = data.filters.accounts.find(account => account.id === selectedAccount)?.name || '全部站点';
    $('#statsScope').textContent = `当前范围：${accountLabel} · ${selectedModel || '全部模型'}`;
    $('#statsUpdatedAt').textContent = `更新于 ${new Date(data.updatedAt).toLocaleTimeString()}`;
    $('#todayRequests').textContent = data.today.requests.toLocaleString();
    $('#todaySuccessRate').textContent = `${data.today.successRate}%`;
    $('#monthRequests').textContent = data.month.requests.toLocaleString();
    $('#allResults').textContent = `${data.all.successful.toLocaleString()} / ${data.all.failed.toLocaleString()}`;
    $('#firstHitRate').textContent = `${data.all.firstHitRate}%`;
    $('#switchCount').textContent = data.all.switched.toLocaleString();
    $('#averageLatency').textContent = data.all.averageLatencyMs === null ? '—' : `${data.all.averageLatencyMs} ms`;
    $('#p95Latency').textContent = data.all.p95LatencyMs === null ? '—' : `${data.all.p95LatencyMs} ms`;
    $('#inputTokens').textContent = data.tokens.all.input.toLocaleString(); $('#todayInputTokens').textContent = `今日 ${data.tokens.today.input.toLocaleString()}`;
    $('#outputTokens').textContent = data.tokens.all.output.toLocaleString(); $('#todayOutputTokens').textContent = `今日 ${data.tokens.today.output.toLocaleString()}`;
    $('#cachedTokens').textContent = data.tokens.all.cached.toLocaleString(); $('#todayCachedTokens').textContent = `今日 ${data.tokens.today.cached.toLocaleString()}`;
    $('#totalTokens').textContent = data.tokens.all.total.toLocaleString(); $('#measuredRequests').textContent = `${data.tokens.all.measured.toLocaleString()} 次返回用量`;
    $('#trendTitle').textContent = `近 ${range} 天请求`;
    const max = Math.max(1, ...data.days.map(day => day.requests));
    $('#trendChart').innerHTML = data.days.map(day => `<div class="trend-day"><div class="trend-bar"><i style="height:${Math.max(day.requests ? 8 : 2, day.requests / max * 100)}%"></i></div><strong>${day.requests}</strong><span>${esc(day.date.slice(5))}</span></div>`).join('');
    const rows = list => list.map((row, index) => `<div><b>${index + 1}</b><span><strong>${esc(row.name)}</strong><small>${row.attempts} 次尝试 · 成功 ${row.successful} · 失败 ${row.failed}</small><i class="success-bar"><u style="width:${row.successRate}%"></u></i></span><em>${row.successRate}%<small>${row.averageLatencyMs === null ? '—' : row.averageLatencyMs + ' ms'}</small></em></div>`).join('') || '<p>当前范围还没有网关调用记录。</p>';
    $('#siteRanking').innerHTML = rows(data.sites);
    $('#modelRanking').innerHTML = rows(data.models);
    const compactRows = list => list.map((row, index) => `<div><b>${index + 1}</b><span><strong>${esc(row.name)}</strong></span><em>${row.count.toLocaleString()} 次</em></div>`).join('') || '<p>暂无记录。</p>';
    $('#failureRanking').innerHTML = compactRows(data.failures);
    $('#endpointRanking').innerHTML = compactRows(data.endpoints);
  } catch (error) { alert(`统计加载失败：${error.message}`); }
};

window.loadLogs = async () => {
  try {
    const query = new URLSearchParams({ action: $('#logAction').value, status: $('#logStatus').value, accountId: $('#logAccount').value });
    const data = await api(`/api/logs?${query}`);
    const selected = $('#logAccount').value;
    $('#logAccount').innerHTML = '<option value="">全部站点</option>' + data.accounts.map(account => `<option value="${esc(account.id)}">${esc(account.name)}</option>`).join('');
    $('#logAccount').value = selected;
    $('#logResults').innerHTML = data.runs.map(run => {
      const action = run.action === 'gateway' ? '网关' : run.action === 'checkin' ? '签到' : '轮询';
      const result = run.status === 'ok' ? '成功' : run.status === 'already' ? '已签到' : '失败';
      const usage = Number.isFinite(run.totalTokens) ? `输入 ${run.inputTokens || 0} · 输出 ${run.outputTokens || 0} · 缓存 ${run.cachedTokens || 0} · 总计 ${run.totalTokens}` : '';
      const details = [run.modelName, usage, Number.isFinite(run.latencyMs) ? `${run.latencyMs} ms` : '', run.statusCode ? `HTTP ${run.statusCode}` : ''].filter(Boolean).join(' · ');
      return `<article><time>${new Date(run.startedAt).toLocaleString()}</time><strong>${esc(run.accountName)}</strong><span class="log-kind">${action}</span><span class="${run.status}">${result}</span><p>${esc(details || run.message || '—')}</p></article>`;
    }).join('') || '<p>当前筛选下没有日志。</p>';
  } catch (error) { alert(`日志加载失败：${error.message}`); }
};
for (const selector of ['#logAction', '#logStatus', '#logAccount']) document.addEventListener('change', event => { if (event.target.matches(selector)) loadLogs(); });

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
window.openServerBrowser = async id => {
  const browserWindow = window.open('about:blank', 'sitePointsServerBrowser');
  try {
    await api(`/api/accounts/${id}/browser-open`, { method: 'POST' });
    if (browserWindow) browserWindow.location = '/browser'; else location.href = '/browser';
  } catch (error) {
    browserWindow?.close();
    alert(`服务器浏览器打开失败：${error.message}`);
  }
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
let pickingAccount = ''; let pickedModels = []; let modelLoadSequence = 0; let modelsLoading = false;
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
  if (modelsLoading) {
    $('#modelCategories').innerHTML = '<p>正在拉取当前站点的模型和价格…</p>';
    $('#modelChoices').innerHTML = '';
    return;
  }
  const visible = pickedModels.filter(model => model.billing === activeBilling);
  const categories = [...new Set(visible.map(model => model.category))];
  $('#modelCategories').innerHTML = categories.map(category => `<button class="category-button ghost" data-category="${esc(category)}" onclick="showCategory('${esc(category)}')">${esc(category)} <small>${visible.filter(model => model.category === category).length}</small></button>`).join('') || `<p>没有找到可用的${activeBilling === 'call' ? '按次' : '按量'}模型。</p>`;
  $('#modelChoices').innerHTML = '';
  if (categories.length) showCategory(categories[0]);
}
window.setBilling = billing => { activeBilling = billing; localStorage.setItem('modelBilling', billing); document.querySelectorAll('.billing-button').forEach(button => { const active = button.dataset.billing === billing; button.classList.toggle('active', active); button.classList.toggle('ghost', !active); }); renderCategories(); };
window.openModels = async id => {
  const requestSequence = ++modelLoadSequence;
  pickingAccount = id;
  const account = accounts.find(x => x.id === id);
  if (!account?.hasApiKey) return alert('请先编辑站点并填写 API Key');
  pickedModels = [];
  modelsLoading = true;
  $('#modelPickerTitle').textContent = `${account.name} · 选择模型`;
  $('#modelPicker').showModal();
  setBilling(activeBilling);
  try {
    const models = (await api(`/api/accounts/${id}/models`, { method: 'POST' })).models;
    if (requestSequence !== modelLoadSequence || pickingAccount !== id) return;
    pickedModels = models;
    modelsLoading = false;
    setBilling(activeBilling);
  } catch (error) {
    if (requestSequence !== modelLoadSequence || pickingAccount !== id) return;
    modelsLoading = false;
    $('#modelCategories').innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
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
$('#closeModels').onclick = () => {
  modelLoadSequence++;
  modelsLoading = false;
  pickedModels = [];
  $('#modelPicker').close();
};
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
