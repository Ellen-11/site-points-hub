const cdpBase = process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9222';

async function cdpTarget(url, { activate = true } = {}) {
  let response;
  try {
    response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Error(`服务器浏览器未启动：${error.cause?.code || error.message}`);
  }
  if (!response.ok) throw new Error(`服务器浏览器不可用 (HTTP ${response.status})`);
  const target = await response.json();
  if (activate) await fetch(`${cdpBase}/json/activate/${encodeURIComponent(target.id)}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
  return target;
}

async function closeTarget(id) {
  await fetch(`${cdpBase}/json/close/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); let nextId = 0;
    const pending = new Map();
    const listeners = new Map();
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
        on(method, listener) {
          if (!listeners.has(method)) listeners.set(method, new Set());
          listeners.get(method).add(listener);
          return () => listeners.get(method)?.delete(listener);
        },
        close() { socket.close(); }
      });
    };
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        for (const listener of listeners.get(message.method) || []) listener(message.params || {});
        return;
      }
      if (!pending.has(message.id)) return;
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

export function bearerTokenFromHeaders(headers = {}, ignoredTokens = []) {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization');
  const token = String(entry?.[1] || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  return token && !new Set(ignoredTokens).has(token) ? token : '';
}

export function bearerTokenFromResponseText(text = '', ignoredTokens = []) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { return ''; }
  const ignored = new Set(ignoredTokens);
  const tokenPattern = /^(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{24,})$/;
  const visit = (value, key = '', depth = 0) => {
    if (depth > 5 || value == null) return '';
    if (typeof value === 'string') {
      const clean = value.trim().replace(/^Bearer\s+/i, '');
      if (/refresh|api.?key/i.test(key) || !/(?:^|[_-])(?:access[_-]?)?token$/i.test(key)) return '';
      return tokenPattern.test(clean) && !ignored.has(clean) ? clean : '';
    }
    if (typeof value !== 'object') return '';
    for (const [childKey, childValue] of Object.entries(value)) {
      const found = visit(childValue, childKey, depth + 1);
      if (found) return found;
    }
    return '';
  };
  return visit(data);
}

function responseTokenListener(client, finish, ignoredTokens = [], ready = () => true) {
  return client.on('Network.responseReceived', event => {
    if (!ready()) return;
    const contentType = String(event?.response?.mimeType || event?.response?.headers?.['content-type'] || event?.response?.headers?.['Content-Type'] || '');
    if (!/json/i.test(contentType)) return;
    client.call('Network.getResponseBody', { requestId: event.requestId }).then(result => {
      const text = result?.base64Encoded ? Buffer.from(result.body || '', 'base64').toString('utf8') : result?.body || '';
      const token = bearerTokenFromResponseText(text, ignoredTokens);
      if (token) finish(token);
    }).catch(() => {});
  });
}

export function normalizeLoginActionText(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function storedTokenExpression() {
  return `(() => {
    const tokenPattern = /^(?:eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{24,})$/;
    const visit = (value, key = '', depth = 0) => {
      if (depth > 4 || value == null) return '';
      if (typeof value === 'string') {
        const clean = value.trim().replace(/^Bearer\\s+/i, '');
        if (!/refresh|api.?key/i.test(key) && /access.?token|auth.?token|(^|[_-])token$/i.test(key) && tokenPattern.test(clean)) return clean;
        try { return visit(JSON.parse(value), key, depth + 1); } catch {}
        if (/refresh|api.?key/i.test(key)) return '';
        const jwt = clean.match(/eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/);
        return jwt?.[0] || '';
      }
      if (typeof value !== 'object') return '';
      for (const [childKey, childValue] of Object.entries(value)) {
        const found = visit(childValue, childKey, depth + 1);
        if (found) return found;
      }
      return '';
    };
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index); const found = visit(storage.getItem(key), key);
        if (found) return found;
      }
    }
    return '';
  })()`;
}

async function existingOriginTargets(origin) {
  const response = await fetch(`${cdpBase}/json/list`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return [];
  const targets = await response.json();
  return targets.filter(target => target.type === 'page' && target.webSocketDebuggerUrl && (() => {
    try { return new URL(target.url).origin === origin; } catch { return false; }
  })());
}

async function tokenFromTarget(target, reload = false, ignoredTokens = []) {
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await client.call('Runtime.enable');
    const stored = await client.call('Runtime.evaluate', { expression: storedTokenExpression(), returnByValue: true });
    const storedToken = String(stored?.result?.value || '');
    if (storedToken && !new Set(ignoredTokens).has(storedToken)) return storedToken;
    if (!reload) return '';

    await client.call('Network.enable');
    await client.call('Page.enable');
    let finish;
    const captured = new Promise(resolve => { finish = resolve; });
    const off = client.on('Network.requestWillBeSent', event => {
      const token = bearerTokenFromHeaders(event?.request?.headers, ignoredTokens);
      if (token) finish(token);
    });
    const offResponse = responseTokenListener(client, finish, ignoredTokens);
    await client.call('Page.reload', { ignoreCache: true });
    const token = await Promise.race([captured, new Promise(resolve => setTimeout(() => resolve(''), 6000))]);
    off();
    offResponse();
    return token;
  } finally {
    client.close();
  }
}

async function evaluateUntil(client, expression, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await client.call('Runtime.evaluate', { expression, returnByValue: true });
      if (!result?.exceptionDetails && result?.result?.value === true) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return false;
}

function clickActionExpression(actionText) {
  return `(() => {
    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9\\u4e00-\\u9fff]+/g, '');
    const expected = ${JSON.stringify(normalizeLoginActionText(actionText))};
    const elements = [...document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')];
    const target = elements.find(element => !element.disabled && element.getClientRects().length && normalize(element.innerText || element.textContent || element.value || element.getAttribute('aria-label')) === expected);
    if (!target) return false;
    target.click();
    return true;
  })()`;
}

async function performLoginAction(target, options = {}) {
  const expected = normalizeLoginActionText(options.actionText);
  if (!expected) return { clicked: false, token: '' };
  const client = await connectCdp(target.webSocketDebuggerUrl);
  let off = () => {};
  try {
    await client.call('Runtime.enable');
    await client.call('Network.enable');
    const hasCredentials = Boolean(options.username && options.password);
    let captureReady = !hasCredentials;
    let requestToken = '';
    let finish;
    const captured = new Promise(resolve => { finish = resolve; });
    off = client.on('Network.requestWillBeSent', event => {
      if (!captureReady) return;
      const token = bearerTokenFromHeaders(event?.request?.headers, options.ignoredTokens || []);
      if (!token) return;
      requestToken = token;
      // A stale page can fire one last request with its expired token while the
      // login form is being submitted. With credentials configured, wait for
      // the login response body first and only use the newest request token as
      // a timeout fallback.
      if (!hasCredentials) finish(token);
    });
    const offResponse = responseTokenListener(client, finish, options.ignoredTokens || [], () => captureReady);
    const formReadyExpression = `(() => [...document.querySelectorAll('input[type="password"]')].some(element => !element.disabled && element.getClientRects().length))()`;
    let clicked = !options.nextActionText && hasCredentials && await evaluateUntil(client, formReadyExpression, 5);
    const clickExpression = clickActionExpression(expected);
    if (!clicked) clicked = await evaluateUntil(client, clickExpression, 25);
    if (!clicked) return { clicked: false, token: '' };

    if (options.nextActionText) {
      const nextClicked = await evaluateUntil(client, clickActionExpression(options.nextActionText), 30);
      if (!nextClicked) return { clicked: false, token: '' };
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (options.username && options.password) {
      const fillExpression = `(() => {
        const visible = element => element && !element.disabled && element.getClientRects().length;
        const password = [...document.querySelectorAll('input[type="password"]')].find(visible);
        const usernames = [...document.querySelectorAll('input[autocomplete="username"],input[name*="user" i],input[name*="email" i],input[type="email"],input[type="text"]')];
        const username = usernames.find(element => visible(element) && element !== password);
        if (!username || !password) return false;
        const setValue = (element, value) => {
          const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
          if (setter) setter.call(element, value); else element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setValue(username, ${JSON.stringify(options.username)});
        setValue(password, ${JSON.stringify(options.password)});
        return true;
      })()`;
      const filled = await evaluateUntil(client, fillExpression, 20);
      if (filled) {
        if (options.agree) {
          const agreementExpression = `(() => {
            const words = /agree|agreement|terms|privacy|consent|read|同意|协议|隐私|条款/i;
            const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')];
            for (const checkbox of checkboxes) {
              const label = [...document.querySelectorAll('label')].find(item => item.htmlFor && item.htmlFor === checkbox.id) || checkbox.closest('label');
              const container = label || checkbox.parentElement;
              if (!words.test(container?.textContent || '')) continue;
              if (checkbox.checked) return true;
              (label || checkbox).click();
              return true;
            }
            const custom = [...document.querySelectorAll('[role="checkbox"]')].find(element => words.test((element.closest('label') || element.parentElement || element).textContent || ''));
            if (!custom) return false;
            if (custom.getAttribute('aria-checked') !== 'true') custom.click();
            return true;
          })()`;
          const agreed = await evaluateUntil(client, agreementExpression, 10);
          if (agreed) await new Promise(resolve => setTimeout(resolve, 500));
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        captureReady = true;
        const submitExpression = `(() => {
          const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9\\u4e00-\\u9fff]+/g, '');
          const expected = ${JSON.stringify(expected)};
          const password = [...document.querySelectorAll('input[type="password"]')].find(element => element.getClientRects().length);
          if (!password) return false;
          const form = password.form || password.closest('form');
          const buttons = [...(form || document).querySelectorAll('button[type="submit"],input[type="submit"],button')].filter(element => !element.disabled && element.getClientRects().length);
          const submit = buttons.find(element => normalize(element.innerText || element.textContent || element.value || element.getAttribute('aria-label')) === expected) || buttons[0];
          if (submit) { submit.click(); return true; }
          if (form?.requestSubmit) { form.requestSubmit(); return true; }
          return false;
        })()`;
        await evaluateUntil(client, submitExpression, 5);
      }
    }
    const token = await Promise.race([captured, new Promise(resolve => setTimeout(() => resolve(''), 10000))]);
    offResponse();
    return { clicked: true, token: token || requestToken };
  } finally {
    off();
    client.close();
  }
}

async function recoverTokenWithLoginAction(target, loginOptions, origin) {
  const clicked = await performLoginAction(target, loginOptions);
  if (!clicked.clicked) return '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const targets = await existingOriginTargets(origin).catch(() => []);
    for (const candidate of targets) {
      const token = await tokenFromTarget(candidate, false, loginOptions.ignoredTokens || []).catch(() => '');
      if (token) return token;
    }
  }
  return clicked.token;
}

export async function accessTokenInBrowser(baseUrl, loginOptions = {}) {
  if (typeof loginOptions === 'string') loginOptions = { actionText: loginOptions };
  loginOptions.ignoredTokens = [...new Set((loginOptions.ignoredTokens || []).map(token => String(token || '').trim()).filter(Boolean))];
  const origin = new URL(baseUrl).origin;
  const existing = await existingOriginTargets(origin);
  for (const target of existing) {
    const token = await tokenFromTarget(target, false, loginOptions.ignoredTokens);
    if (token) return token;
  }
  const ordered = [...existing].sort((left, right) => {
    const score = target => /(?:login|sign[-_]?in|auth)/i.test(String(target.url || '')) ? 1 : 0;
    return score(right) - score(left);
  });
  const freshAutomatedLogin = Boolean(loginOptions.actionText && (
    (loginOptions.username && loginOptions.password) || loginOptions.nextActionText
  ));
  if (loginOptions.actionText && !freshAutomatedLogin) {
    for (const target of ordered.slice(0, 3)) {
      const token = await recoverTokenWithLoginAction(target, loginOptions, origin);
      if (token) return token;
    }
  }
  if (!freshAutomatedLogin) {
    for (const target of ordered.slice(0, 3)) {
      const token = await tokenFromTarget(target, true, loginOptions.ignoredTokens);
      if (token) return token;
    }
  }

  const target = await cdpTarget(new URL('/', baseUrl).href);
  let closeWhenDone = false;
  try {
    const client = await connectCdp(target.webSocketDebuggerUrl);
    try {
      await client.call('Runtime.enable');
      await waitForOrigin(client, origin);
    } finally { client.close(); }
    await new Promise(resolve => setTimeout(resolve, 800));
    const existingToken = await tokenFromTarget(target, false, loginOptions.ignoredTokens);
    if (existingToken) { closeWhenDone = true; return existingToken; }
    if (loginOptions.actionText) {
      const token = await recoverTokenWithLoginAction(target, loginOptions, origin);
      if (token) { closeWhenDone = true; return token; }
    }
    const token = await tokenFromTarget(target, true, loginOptions.ignoredTokens);
    closeWhenDone = Boolean(token);
    return token;
  } finally {
    if (closeWhenDone) await closeTarget(target.id);
  }
}

async function waitForOrigin(client, origin) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await client.call('Runtime.evaluate', { expression: '({ origin: location.origin, ready: document.readyState })', returnByValue: true });
    const value = result?.result?.value;
    if (value?.origin === origin && value.ready === 'complete') return;
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
  const target = await cdpTarget(new URL('/', baseUrl).href, { activate: false });
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
