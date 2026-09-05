const cdpBase = process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9222';

async function cdpTarget(url) {
  let response;
  try {
    response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Error(`服务器浏览器未启动：${error.cause?.code || error.message}`);
  }
  if (!response.ok) throw new Error(`服务器浏览器不可用 (HTTP ${response.status})`);
  return response.json();
}

async function closeTarget(id) {
  await fetch(`${cdpBase}/json/close/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); let nextId = 0;
    const pending = new Map();
    const timer = setTimeout(() => { socket.close(); reject(new Error('连接服务器浏览器超时')); }, 10000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve({
        call(method, params = {}) {
          return new Promise((done, fail) => {
            const id = ++nextId; pending.set(id, { done, fail });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() { socket.close(); }
      });
    };
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !pending.has(message.id)) return;
      const { done, fail } = pending.get(message.id); pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message)); else done(message.result);
    };
    socket.onerror = () => reject(new Error('无法连接服务器浏览器'));
    socket.onclose = () => {
      for (const { fail } of pending.values()) fail(new Error('服务器浏览器连接已关闭'));
      pending.clear();
    };
  });
}

async function waitForOrigin(client, origin) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await client.call('Runtime.evaluate', { expression: '({ origin: location.origin, ready: document.readyState })', returnByValue: true });
    const value = result?.result?.value;
    if (value?.origin === origin && value.ready !== 'loading') return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('服务器浏览器打开站点超时');
}

export async function browserAvailable() {
  try {
    const response = await fetch(`${cdpBase}/json/version`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch { return false; }
}

export async function openBrowserLogin(baseUrl) {
  const url = new URL(baseUrl).href;
  await cdpTarget(url);
  return { ok: true, url };
}

async function fetchInBrowser(baseUrl, endpoint, method = 'GET', headers = {}, body = '') {
  const target = await cdpTarget(new URL('/', baseUrl).href);
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    const origin = new URL(baseUrl).origin;
    await client.call('Runtime.enable');
    await waitForOrigin(client, origin);
    const expression = `(async () => {
      const response = await fetch(${JSON.stringify(endpoint)}, {
        method: ${JSON.stringify(method)}, credentials: 'include', cache: 'no-store',
        headers: ${JSON.stringify({ accept: 'application/json, text/plain, */*', ...headers })},
        body: ${body ? JSON.stringify(body) : 'undefined'}
      });
      return { status: response.status, contentType: response.headers.get('content-type') || '', text: await response.text() };
    })()`;
    const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || '服务器浏览器请求失败');
    const value = result?.result?.value;
    if (!value) throw new Error('服务器浏览器没有返回请求结果');
    return value;
  } finally {
    client.close();
    await closeTarget(target.id);
  }
}

function responseMessage(data) {
  const message = data?.error?.message || data?.error || data?.message || data?.msg;
  return typeof message === 'string' ? message : '';
}

export async function refreshInBrowser(baseUrl, refreshPath) {
  const value = await fetchInBrowser(baseUrl, refreshPath, 'POST');
  let data;
  try { data = JSON.parse(value.text); } catch { throw new Error(`刷新接口没有返回 JSON (HTTP ${value.status})`); }
  if (value.status < 200 || value.status >= 300) {
    throw new Error(`服务器浏览器续期失败：${responseMessage(data) || `HTTP ${value.status}`} (HTTP ${value.status})`);
  }
  return data;
}

export async function requestInBrowser(baseUrl, endpoint, method = 'GET', headers = {}, body = '') {
  const value = await fetchInBrowser(baseUrl, endpoint, method, headers, body);
  let data;
  try {
    data = JSON.parse(value.text);
  } catch {
    const html = /text\/html/i.test(value.contentType) || /^\s*(?:<!doctype\s+html|<html\b)/i.test(String(value.text));
    throw new Error(html
      ? `服务器浏览器仍返回登录网页而不是 JSON (HTTP ${value.status})`
      : value.text.slice(0, 200) || `服务器浏览器接口没有返回 JSON (HTTP ${value.status})`);
  }
  if (value.status < 200 || value.status >= 300) {
    const message = responseMessage(data);
    throw new Error(message ? `${message} (HTTP ${value.status})` : `HTTP ${value.status}`);
  }
  const message = responseMessage(data);
  if (/unauthorized|invalid\s+(access\s+)?token|not\s+logged\s+in|登录已?失效|未登录|请先登录/i.test(message)) {
    throw new Error(`${message} (HTTP ${value.status})`);
  }
  return data;
}
