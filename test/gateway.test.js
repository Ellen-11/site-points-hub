import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installGateway, rewriteGatewayBody, selectGatewayCandidates } from '../src/gateway.js';

test('gateway ignores the client model and uses polling sites in saved order', () => {
  const db = {
    pollTags: ['网关'],
    accounts: [
      { id: 'first', enabled: true, tags: ['网关'], apiKey: 'encrypted', modelName: 'gemini-real' },
      { id: 'skip', enabled: true, tags: ['其他'], apiKey: 'encrypted', modelName: 'gpt-real' },
      { id: 'second', enabled: true, tags: ['网关'], apiKey: 'encrypted', modelName: 'claude-real' }
    ]
  };

  assert.deepEqual(selectGatewayCandidates(db).map(account => account.id), ['first', 'second']);
  assert.equal(rewriteGatewayBody({ model: 'anything', messages: [] }, db.accounts[0]).model, 'gemini-real');
});

test('gateway rejects requests when its client key is missing', async () => {
  const previous = process.env.GATEWAY_API_KEY;
  delete process.env.GATEWAY_API_KEY;
  const app = express(); app.use(express.json()); installGateway(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/v1/models`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.GATEWAY_API_KEY; else process.env.GATEWAY_API_KEY = previous;
  }
});
