const $ = s => document.querySelector(s);
let accounts = [];

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '请求失败');
  return data;
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function load() {
  try {
    const data = await api('/api/dashboard');
    accounts = data.accounts;
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
    render(data);
  } catch { $('#login').classList.remove('hidden'); }
}

function render(data) {
  $('#siteCount').textContent = data.accounts.length;
  $('#okCount').textContent = data.accounts.filter(x => x.lastStatus === 'ok').length;
  $('#errorCount').textContent = data.accounts.filter(x => x.lastStatus === 'error').length;
  $('#cards').innerHTML = data.accounts.length ? data.accounts.map(a => `
    <article class="card">
      <div class="top"><strong>${esc(a.name)}</strong><span class="status ${a.lastStatus === 'error' ? 'error' : ''}">${a.lastStatus === 'error' ? '异常' : a.lastStatus === 'ok' ? '正常' : '未运行'}</span></div>
      <a class="site-link" href="${esc(a.baseUrl)}" target="_blank" rel="noopener noreferrer">打开站点 ↗</a>
      <div class="balance">${esc(a.balance ?? '—')}</div>
      ${a.modelName ? `<div class="model-box"><strong>${esc(a.modelName)}</strong><span>${esc(a.modelPrice?.text || '价格尚未查询')}</span></div>` : ''}
      <p class="meta">${a.lastError ? esc(a.lastError) : a.lastCheckinMessage ? esc(a.lastCheckinMessage) : a.lastCheckedAt ? '更新于 ' + new Date(a.lastCheckedAt).toLocaleString() : '等待首次刷新'}</p>
      <div class="card-actions"><button onclick="run('${a.id}','poll')">刷新</button><button class="secondary" onclick="run('${a.id}','checkin')">签到</button>${a.modelName ? `<button class="ghost" onclick="pricing('${a.id}')">查价格</button>` : ''}<button class="ghost" onclick="edit('${a.id}')">编辑</button><button class="ghost" onclick="removeAccount('${a.id}')">删除</button></div>
    </article>`).join('') : '<article class="panel"><p>还没有站点，先添加一个。</p></article>';
  $('#runs').innerHTML = data.runs.length ? data.runs.map(r => {
    const account = data.accounts.find(x => x.id === r.accountId);
    const label = r.status === 'already' ? '已签到' : r.status === 'ok' ? '成功' : '失败';
    return `<div><span>${esc(account?.name || '已删除站点')}</span><span>${r.action === 'checkin' ? '签到' : '轮询'}</span><span class="${r.status}">${label}</span><span>${esc(r.message || new Date(r.startedAt).toLocaleString())}</span></div>`;
  }).join('') : '<p>暂无运行记录</p>';
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: new FormData(event.target).get('password') }) });
    $('#loginError').textContent = '';
    load();
  } catch (error) { $('#loginError').textContent = error.message; }
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
window.pricing = async id => { try { await api(`/api/accounts/${id}/pricing`, { method: 'POST' }); } catch (error) { alert(error.message); } load(); };
window.removeAccount = async id => { if (confirm('确定删除这个站点？')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); load(); } };
$('#pollAll').onclick = async () => { await api('/api/run-all/poll', { method: 'POST' }); load(); };
$('#checkinAll').onclick = async () => { await api('/api/run-all/checkin', { method: 'POST' }); load(); };
load();
