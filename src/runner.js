import dns from 'node:dns/promises';
import net from 'node:net';
import { decrypt, readStore, writeStore } from './store.js';

function privateIp(ip) {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith('169.254.') || ip.startsWith('fc') || ip.startsWith('fd');
}

async function safeUrl(base, endpoint) {
  const url = new URL(endpoint || '/', base);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('只允许 HTTPS 站点');
  }
  if (net.isIP(url.hostname) && privateIp(url.hostname)) throw new Error('不允许访问内网地址');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(x => privateIp(x.address))) throw new Error('站点解析到内网地址');
  return url;
}

export function valueAt(obj, dotted) {
  return dotted.split('.').reduce((v, k) => v?.[k], obj);
}

async function call(account, endpoint, method, panelType = 'generic') {
  const url = await safeUrl(account.baseUrl, endpoint);
  const headers = { accept: 'application/json', 'user-agent': 'SitePointsHub/1.0' };
  const token = decrypt(account.credential);
  if (panelType === 'newapi') {
    headers.cookie = token;
    headers['new-api-user'] = String(account.userId || '');
  } else {
    if (account.authType === 'bearer') headers.authorization = `Bearer ${token}`;
    if (account.authType === 'cookie') headers.cookie = token;
    if (account.authType === 'header') headers[account.headerName || 'authorization'] = token;
  }
  const response = await fetch(url, { method, headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

export function formatNewApiQuota(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${(amount / 500000).toFixed(2)}` : '—';
}

async function runNewApi(account, action) {
  if (!account.userId) throw new Error('请填写用户 ID');
  if (!account.credential) throw new Error('请填写登录 Cookie');
  if (action === 'checkin') await call(account, '/api/user/checkin', 'POST', 'newapi');
  const data = await call(account, '/api/user/self', 'GET', 'newapi');
  return formatNewApiQuota(valueAt(data, 'data.quota'));
}

async function runGeneric(account, action) {
  if (action === 'checkin') await call(account, account.checkinPath, account.checkinMethod || 'POST');
  const data = await call(account, account.balancePath, 'GET');
  const raw = valueAt(data, account.balanceField || 'balance');
  const divisor = Number(account.balanceDivisor || 1);
  return divisor !== 1 && Number.isFinite(Number(raw)) ? String(Number(raw) / divisor) : String(raw ?? '—');
}

export async function runAccount(id, action = 'poll') {
  const db = readStore();
  const account = db.accounts.find(x => x.id === id);
  if (!account || !account.enabled) throw new Error('账户不存在或已停用');
  const startedAt = new Date().toISOString();
  try {
    const panelType = account.panelType === 'generic' ? 'generic' : 'newapi';
    account.balance = panelType === 'newapi' ? await runNewApi(account, action) : await runGeneric(account, action);
    account.detectedType = panelType;
    account.lastStatus = 'ok';
    account.lastError = '';
    account.lastCheckedAt = new Date().toISOString();
    if (action === 'checkin') account.lastCheckinAt = account.lastCheckedAt;
    db.runs.unshift({ id: crypto.randomUUID(), accountId: id, action, status: 'ok', startedAt });
  } catch (error) {
    account.lastStatus = 'error';
    account.lastError = error.message;
    account.lastCheckedAt = new Date().toISOString();
    db.runs.unshift({ id: crypto.randomUUID(), accountId: id, action, status: 'error', message: error.message, startedAt });
  }
  db.runs = db.runs.slice(0, 200);
  writeStore(db);
  return account;
}

export async function runAll(action = 'poll') {
  const ids = readStore().accounts.filter(x => x.enabled).map(x => x.id);
  return Promise.allSettled(ids.map(id => runAccount(id, action)));
}
