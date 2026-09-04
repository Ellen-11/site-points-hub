import dns from 'node:dns/promises';
import net from 'node:net';
import { decrypt, readStore, writeStore } from './store.js';

function privateIp(ip) {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith('169.254.') || ip.startsWith('fc') || ip.startsWith('fd');
}

export async function safeUrl(base, endpoint) {
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
  } else if (panelType !== 'public') {
    if (account.authType === 'bearer') headers.authorization = `Bearer ${token}`;
    if (account.authType === 'cookie') headers.cookie = token;
    if (account.authType === 'header') headers[account.headerName || 'authorization'] = token;
  }
  const response = await fetch(url, { method, headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: /^\s*</.test(text) ? `接口返回网页而不是 JSON (HTTP ${response.status})` : text.slice(0, 200) }; }
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

export function formatNewApiQuota(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${(amount / 500000).toFixed(2)}` : '—';
}

function findConfig(data, names) {
  if (!data || typeof data !== 'object') return undefined;
  for (const name of names) if (data[name] !== undefined) return data[name];
  for (const value of Object.values(data)) {
    const found = findConfig(value, names);
    if (found !== undefined) return found;
  }
}

export function formatQuota(value, config = {}, preference = 'auto') {
  const quota = Number(value);
  if (!Number.isFinite(quota)) return '—';
  const quotaPerUnit = Number(findConfig(config, ['quota_per_unit', 'quotaPerUnit', 'QuotaPerUnit'])) || 500000;
  const configuredType = String(findConfig(config, ['quota_display_type', 'quotaDisplayType', 'QuotaDisplayType']) || 'USD').toUpperCase();
  const type = preference === 'auto' ? configuredType : String(preference).toUpperCase();
  if (type === 'TOKENS' || type === 'RAW') return Math.round(quota).toLocaleString('zh-CN');
  const usd = quota / quotaPerUnit;
  if (type === 'CNY') {
    const rate = Number(findConfig(config, ['usd_exchange_rate', 'usdExchangeRate', 'USDExchangeRate'])) || 7.2;
    return `¥${(usd * rate).toFixed(2)}`;
  }
  return `$${usd.toFixed(2)}`;
}

export function readRemainingQuota(data) {
  const quota = Number(valueAt(data, 'data.quota'));
  const total = Number(valueAt(data, 'data.total_quota'));
  const used = Number(valueAt(data, 'data.used_quota'));
  if (Number.isFinite(quota) && quota > 0) return quota;
  if (Number.isFinite(total) && Number.isFinite(used) && total > used) return total - used;
  return Number.isFinite(quota) ? quota : undefined;
}

export function summarizeModelPrice(item, quotaPerUnit = 500000) {
  if (!item) throw new Error('定价列表中找不到这个模型');
  if (Number(item.quota_type) === 1) {
    const price = Number(item.model_price);
    if (!Number.isFinite(price)) throw new Error('该模型没有可用的按次价格');
    return { type: 'per_call', text: `$${price.toFixed(4)} / 次`, model: item.model_name };
  }
  const ratio = Number(item.model_ratio);
  const completion = Number(item.completion_ratio || 1);
  if (!Number.isFinite(ratio)) throw new Error('该模型没有可用的 Token 价格');
  const input = ratio * 1000000 / quotaPerUnit;
  const output = input * completion;
  return { type: 'tokens', text: `输入 $${input.toFixed(4)} / 1M · 输出 $${output.toFixed(4)} / 1M`, model: item.model_name };
}

export function pricingAuthType(account) {
  return account.panelType === 'generic' ? 'generic' : 'newapi';
}

export function modelCategory(name) {
  const value = String(name).toLowerCase();
  if (/gemini/.test(value)) return 'Gemini';
  if (/gemma/.test(value)) return 'Gemma';
  if (/claude/.test(value)) return 'Claude';
  if (/deepseek/.test(value)) return 'DeepSeek';
  if (/qwen|qwq/.test(value)) return 'Qwen';
  if (/gpt|(^|[-_])o[134]([\-_.]|$)/.test(value)) return 'GPT';
  if (/grok/.test(value)) return 'Grok';
  if (/(^|[/_-])glm([/_.-]|$)|zai-org|z-ai/.test(value)) return 'GLM';
  if (/kimi|moonshot/.test(value)) return 'Kimi';
  if (/mistral|mixtral|codestral|devstral|ministral/.test(value)) return 'Mistral';
  if (/minimax/.test(value)) return 'MiniMax';
  if (/nemotron|nvidia/.test(value)) return 'Nemotron';
  if (/stepfun|(^|[/_-])step[-_.]/.test(value)) return 'Step';
  if (/cohere|command-r|north-mini/.test(value)) return 'Cohere';
  if (/llama|meta\//.test(value)) return 'Llama';
  if (/sora|video|veo/.test(value)) return '视频';
  if (/image|dall-e|flux|midjourney/.test(value)) return '图像';
  return '其他';
}

async function callApiKey(account, endpoint) {
  if (!account.apiKey) throw new Error('请先填写该站 API Key');
  const url = await safeUrl(account.baseUrl, endpoint);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${decrypt(account.apiKey)}`, accept: 'application/json', 'user-agent': 'SitePointsHub/1.0' },
    redirect: 'error', signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `模型接口 HTTP ${response.status}`);
  return data;
}

export function buildModelCatalog(modelsResponse, pricingResponse, quotaPerUnit = 500000) {
  const available = new Set((modelsResponse?.data || []).map(x => x.id));
  const customPricing = Array.isArray(pricingResponse?.data?.models);
  const prices = customPricing
    ? pricingResponse.data.models.map(x => ({
      model_name: x.name,
      quota_type: x.quotaType,
      price_type: x.priceType,
      model_price: x.priceValue,
      price_label: x.priceLabel,
      price_unit: 'quota'
    }))
    : Array.isArray(pricingResponse?.data) ? pricingResponse.data : [];
  return prices
    .filter(x => available.has(x.model_name))
    .map(x => {
      const perCall = Number(x.quota_type) === 1 || x.price_type === 'call';
      if (perCall) {
        if (!Number.isFinite(Number(x.model_price))) return null;
        return { name: x.model_name, category: modelCategory(x.model_name), billing: 'call', price: Number(x.model_price), priceUnit: x.price_unit || 'usd', text: x.price_label || `$${Number(x.model_price).toFixed(4)} / 次` };
      }
      if (x.price_label) return { name: x.model_name, category: modelCategory(x.model_name), billing: 'token', price: Number(x.model_price), text: x.price_label };
      const ratio = Number(x.model_ratio);
      if (!Number.isFinite(ratio)) return null;
      const input = ratio * 1000000 / quotaPerUnit;
      const output = input * Number(x.completion_ratio || 1);
      return { name: x.model_name, category: modelCategory(x.model_name), billing: 'token', price: ratio, text: `输入 $${input.toFixed(4)} / 1M · 输出 $${output.toFixed(4)} / 1M` };
    })
    .filter(Boolean)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function estimateRemainingCalls(balanceRaw, model, quotaPerUnit = 500000) {
  if (!model || model.billing !== 'call') return null;
  const price = Number(model.price);
  if (price === 0) return 'unlimited';
  if (balanceRaw === null || balanceRaw === undefined || balanceRaw === '') return null;
  const balance = Number(balanceRaw);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(balance)) return null;
  const available = model.priceUnit === 'quota' ? balance : balance / (Number(quotaPerUnit) || 500000);
  return Math.max(0, Math.floor(available / price));
}

export function estimateAccountCalls(account, model) {
  const direct = estimateRemainingCalls(account?.balanceRaw, model, account?.quotaPerUnit);
  if (direct !== null) return direct;
  const shown = String(account?.balance ?? '').replace(/,/g, '');
  const amount = Number(shown.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(amount)) return null;
  const quotaPerUnit = Number(account?.quotaPerUnit) || 500000;
  if (model?.priceUnit === 'quota') {
    if (shown.includes('$')) return estimateRemainingCalls(amount * quotaPerUnit, model, quotaPerUnit);
    if (shown.includes('¥')) return null;
    if (account?.currency === 'raw' || account?.currency === 'tokens') return estimateRemainingCalls(amount, model, quotaPerUnit);
    return estimateRemainingCalls(amount * quotaPerUnit, model, quotaPerUnit);
  }
  if (model?.priceUnit === 'usd' && (shown.includes('$') || account?.currency === 'usd')) {
    return estimateRemainingCalls(amount * quotaPerUnit, model, quotaPerUnit);
  }
  return null;
}

export function buildPerCallCatalog(modelsResponse, pricingResponse) {
  return buildModelCatalog(modelsResponse, pricingResponse).filter(x => x.billing === 'call').map(({ billing, ...x }) => x);
}

export async function refreshModelCatalog(id) {
  const db = readStore(); const account = db.accounts.find(x => x.id === id);
  if (!account) throw new Error('账户不存在');
  const auth = pricingAuthType(account);
  const models = await callApiKey(account, '/v1/models');
  let pricing;
  try {
    pricing = await call(account, '/api/pricing', 'GET', auth);
    if (!Array.isArray(pricing?.data) && !Array.isArray(pricing?.data?.models)) throw new Error('非价格响应');
  }
  catch { pricing = await call(account, '/api/models/pricing', 'GET', auth); }
  let status = {};
  try { status = await call(account, '/api/status', 'GET', 'public'); } catch {}
  const quotaPerUnit = Number(findConfig(status, ['quota_per_unit', 'quotaPerUnit', 'QuotaPerUnit'])) || 500000;
  account.quotaPerUnit = quotaPerUnit;
  account.models = buildModelCatalog(models, pricing, quotaPerUnit).map(model => ({
    ...model,
    estimatedCalls: estimateAccountCalls(account, model)
  }));
  account.modelsCheckedAt = new Date().toISOString();
  writeStore(db);
  return account.models;
}

export async function refreshModelPrice(id) {
  const db = readStore();
  const account = db.accounts.find(x => x.id === id);
  if (!account) throw new Error('账户不存在');
  if (!account.modelName) throw new Error('请先填写模型名称');
  const pricingAuth = pricingAuthType(account);
  const [pricing, status] = await Promise.all([
    call(account, '/api/pricing', 'GET', pricingAuth),
    call(account, '/api/status', 'GET', 'public').catch(() => ({}))
  ]);
  const list = Array.isArray(pricing?.data) ? pricing.data : Array.isArray(pricing) ? pricing : [];
  const item = list.find(x => x.model_name === account.modelName);
  const quotaPerUnit = Number(findConfig(status, ['quota_per_unit', 'quotaPerUnit', 'QuotaPerUnit'])) || 500000;
  account.modelPrice = summarizeModelPrice(item, quotaPerUnit);
  account.modelPriceCheckedAt = new Date().toISOString();
  writeStore(db);
  return account.modelPrice;
}

export function classifyCheckin(data) {
  const message = String(data?.message ?? data?.msg ?? '').trim();
  const already = /已签到|已经签到|重复签到|already\s*(checked|signed)|checked\s*in/i.test(message);
  if (already) return { status: 'already', message: message || '今日已签到' };
  if (data?.success === false || data?.ok === false || (typeof data?.code === 'number' && data.code !== 0 && data.code !== 200)) {
    throw new Error(message || '站点返回签到失败');
  }
  return { status: 'ok', message: message || '签到成功' };
}

async function runNewApi(account, action) {
  if (!account.userId) throw new Error('请填写用户 ID');
  if (!account.credential) throw new Error('请填写登录 Cookie');
  let checkin;
  if (action === 'checkin') checkin = classifyCheckin(await call(account, '/api/user/checkin', 'POST', 'newapi'));
  let config = {};
  try { config = await call(account, '/api/status', 'GET', 'public'); } catch {}
  const data = await call(account, '/api/user/self', 'GET', 'newapi');
  const rawBalance = readRemainingQuota(data);
  const quotaPerUnit = Number(findConfig(config, ['quota_per_unit', 'quotaPerUnit', 'QuotaPerUnit'])) || 500000;
  return { balance: formatQuota(rawBalance, config, account.currency || 'auto'), rawBalance, quotaPerUnit, checkin };
}

async function runGeneric(account, action) {
  let checkin;
  if (action === 'checkin') {
    if (!account.checkinPath) throw new Error('尚未配置签到接口');
    checkin = classifyCheckin(await call(account, account.checkinPath, account.checkinMethod || 'POST'));
  }
  const data = await call(account, account.balancePath, 'GET');
  const raw = valueAt(data, account.balanceField || 'balance');
  const divisor = Number(account.balanceDivisor || 1);
  const amount = divisor !== 1 && Number.isFinite(Number(raw)) ? Number(raw) / divisor : raw;
  const prefix = account.currency === 'cny' ? '¥' : account.currency === 'usd' ? '$' : '';
  const balance = Number.isFinite(Number(amount)) ? `${prefix}${Number(amount).toFixed(2)}` : String(amount ?? '—');
  return { balance, rawBalance: Number.isFinite(Number(raw)) ? Number(raw) : null, quotaPerUnit: divisor || 1, checkin };
}

export async function runAccount(id, action = 'poll') {
  const db = readStore();
  const account = db.accounts.find(x => x.id === id);
  if (!account || !account.enabled) throw new Error('账户不存在或已停用');
  const startedAt = new Date().toISOString();
  try {
    const panelType = account.panelType === 'generic' ? 'generic' : 'newapi';
    const result = panelType === 'newapi' ? await runNewApi(account, action) : await runGeneric(account, action);
    account.balance = result.balance;
    account.balanceRaw = result.rawBalance;
    account.quotaPerUnit = result.quotaPerUnit || account.quotaPerUnit || 500000;
    if (account.modelPrice?.type === 'per_call') {
      account.modelPrice.estimatedCalls = estimateAccountCalls(account, {
        billing: 'call', price: account.modelPrice.price, priceUnit: account.modelPrice.priceUnit
      });
    }
    account.detectedType = panelType;
    account.lastStatus = 'ok';
    account.lastError = '';
    account.lastCheckedAt = new Date().toISOString();
    if (action === 'checkin') {
      account.lastCheckinAt = account.lastCheckedAt;
      account.lastCheckinStatus = result.checkin.status;
      account.lastCheckinMessage = result.checkin.message;
    }
    db.runs.unshift({ id: crypto.randomUUID(), accountId: id, action, status: result.checkin?.status || 'ok', message: result.checkin?.message || '', startedAt });
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

export function shouldPoll(account) {
  return account.enabled && account.pollEnabled !== false;
}

export async function runAll(action = 'poll') {
  const ids = readStore().accounts.filter(shouldPoll).map(x => x.id);
  return Promise.allSettled(ids.map(id => runAccount(id, action)));
}
