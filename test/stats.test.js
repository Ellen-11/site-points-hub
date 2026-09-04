import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayStatistics } from '../src/stats.js';

test('gateway statistics count logical requests, switches and rankings', () => {
  const runs = [
    { id: 'a1', requestId: 'a', attempt: 1, action: 'gateway', accountId: 'one', modelName: 'gpt-a', status: 'error', latencyMs: 100, startedAt: '2026-09-05T01:00:00Z' },
    { id: 'a2', requestId: 'a', attempt: 2, action: 'gateway', accountId: 'two', modelName: 'gpt-b', status: 'ok', latencyMs: 200, startedAt: '2026-09-05T01:00:01Z' },
    { id: 'b1', requestId: 'b', attempt: 1, action: 'gateway', accountId: 'one', modelName: 'gpt-a', status: 'ok', latencyMs: 300, startedAt: '2026-09-05T02:00:00Z' },
    { id: 'poll', action: 'poll', accountId: 'one', status: 'ok', startedAt: '2026-09-05T02:00:00Z' }
  ];
  const stats = gatewayStatistics(runs, [{ id: 'one', name: '一号' }, { id: 'two', name: '二号' }], new Date('2026-09-05T03:00:00Z'), 'UTC');
  assert.equal(stats.today.requests, 2);
  assert.equal(stats.today.successRate, 100);
  assert.equal(stats.all.switched, 1);
  assert.equal(stats.all.firstHitRate, 50);
  assert.equal(stats.all.averageLatencyMs, 250);
  assert.equal(stats.all.p95LatencyMs, 300);
  assert.equal(stats.month.requests, 2);
  assert.deepEqual(stats.failures, [{ name: '网络或其他错误', count: 1 }]);
  assert.equal(stats.sites[0].name, '一号');
});
