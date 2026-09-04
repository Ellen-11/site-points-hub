import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { decrypt, readStore } from './store.js';
import { safeUrl } from './runner.js';

function authorized(req) {
  const expected = process.env.GATEWAY_API_KEY || '';
  const actual = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !actual) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function candidates(model) {
  return readStore().accounts.filter(account => account.enabled && account.apiKey && account.modelName === model);
}

async function upstreamRequest(account, endpoint, body) {
  const url = await safeUrl(account.baseUrl, endpoint);
  return fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${decrypt(account.apiKey)}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'user-agent': 'SitePointsHub-Gateway/1.0'
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(Number(process.env.GATEWAY_TIMEOUT_MS || 120000))
  });
}

function forward(response, res) {
  res.status(response.status);
  for (const name of ['content-type', 'cache-control', 'x-request-id']) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

export function installGateway(app) {
  app.get('/v1/models', (req, res) => {
    if (!authorized(req)) return res.status(401).json({ error: { message: 'Invalid gateway API key', type: 'authentication_error' } });
    const models = [...new Set(readStore().accounts.filter(x => x.enabled && x.apiKey && x.modelName).map(x => x.modelName))];
    res.json({ object: 'list', data: models.map(id => ({ id, object: 'model', created: 0, owned_by: 'site-points-hub' })) });
  });

  for (const endpoint of ['/v1/chat/completions', '/v1/responses', '/v1/embeddings']) {
    app.post(endpoint, async (req, res) => {
      if (!authorized(req)) return res.status(401).json({ error: { message: 'Invalid gateway API key', type: 'authentication_error' } });
      const model = String(req.body?.model || '');
      if (!model) return res.status(400).json({ error: { message: 'model is required', type: 'invalid_request_error' } });
      const routes = candidates(model);
      if (!routes.length) return res.status(404).json({ error: { message: `No upstream configured for model: ${model}`, type: 'model_not_found' } });
      const errors = [];
      for (const account of routes) {
        try {
          const response = await upstreamRequest(account, endpoint, req.body);
          if (response.status === 429 || response.status >= 500) {
            errors.push(`${account.name}: HTTP ${response.status}`);
            await response.arrayBuffer();
            continue;
          }
          return forward(response, res);
        } catch (error) { errors.push(`${account.name}: ${error.message}`); }
      }
      res.status(502).json({ error: { message: `All upstreams failed: ${errors.join('; ')}`, type: 'upstream_error' } });
    });
  }
}
