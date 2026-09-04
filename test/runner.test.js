import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNewApiQuota, valueAt } from '../src/runner.js';

test('reads nested balance fields', () => {
  assert.equal(valueAt({ data: { points: 120 } }, 'data.points'), 120);
});

test('formats New API quota units', () => {
  assert.equal(formatNewApiQuota(750000), '$1.50');
  assert.equal(formatNewApiQuota('bad'), '—');
});
