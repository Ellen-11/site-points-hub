const cdpBase = process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9222';

async function cdpTarget(url) {
  const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(10000) });
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

export async function refreshInBrowser(baseUrl, refreshPath) {
  const target = await cdpTarget(new URL('/', baseUrl).href);
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    const origin = new URL(baseUrl).origin;
    await client.call('Runtime.enable');
    await waitForOrigin(client, origin);
    const expression = `(async () => {
      const response = await fetch(${JSON.stringify(refreshPath)}, {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { accept: 'application/json, text/plain, */*' }
      });
      return { status: response.status, text: await response.text() };
    })()`;
    const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || '浏览器执行刷新失败');
    const value = result?.result?.value;
    if (!value) throw new Error('服务器浏览器没有返回刷新结果');
    let data;
    try { data = JSON.parse(value.text); } catch { throw new Error(`刷新接口没有返回 JSON (HTTP ${value.status})`); }
    if (value.status < 200 || value.status >= 300) throw new Error(`服务器浏览器续期失败：${data?.message || data?.error || `HTTP ${value.status}`} (HTTP ${value.status})`);
    return data;
  } finally {
    client.close();
    await closeTarget(target.id);
  }
}
