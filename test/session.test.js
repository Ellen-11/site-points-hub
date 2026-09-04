import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, validSession } from '../src/session.js';

test('signed login survives server memory resets', () => {
  const token = createSession('same-deployment-secret', 2000);
  assert.equal(validSession(token, 'same-deployment-secret', 1000), true);
  assert.equal(validSession(token, 'different-secret', 1000), false);
  assert.equal(validSession(token, 'same-deployment-secret', 2001), false);
});
