import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCheckin, formatNewApiQuota, formatQuota, readRemainingQuota, valueAt } from '../src/runner.js';

test('reads nested balance fields', () => {
  assert.equal(valueAt({ data: { points: 120 } }, 'data.points'), 120);
});

test('formats New API quota units', () => {
  assert.equal(formatNewApiQuota(750000), '$1.50');
  assert.equal(formatNewApiQuota('bad'), '—');
});

test('classifies check-in business results', () => {
  assert.deepEqual(classifyCheckin({ success: true, message: '签到成功' }), { status: 'ok', message: '签到成功' });
  assert.deepEqual(classifyCheckin({ success: false, message: '今日已签到' }), { status: 'already', message: '今日已签到' });
  assert.throws(() => classifyCheckin({ success: false, message: 'Token 无效' }), /Token 无效/);
});

test('formats quota using each site currency settings', () => {
  const config = { data: { quota_per_unit: 500000, quota_display_type: 'CNY', usd_exchange_rate: 7.2 } };
  assert.equal(formatQuota(1000000, config, 'auto'), '¥14.40');
  assert.equal(formatQuota(1000000, config, 'usd'), '$2.00');
  assert.equal(formatQuota(1000000, config, 'raw'), '1,000,000');
});

test('supports panels that keep remaining credit in total quota', () => {
  assert.equal(readRemainingQuota({ data: { quota: 0, total_quota: 55467567, used_quota: 0 } }), 55467567);
  assert.equal(readRemainingQuota({ data: { quota: 100, total_quota: 1000, used_quota: 400 } }), 100);
  assert.equal(readRemainingQuota({ data: { quota: 0, total_quota: 1000, used_quota: 1000 } }), 0);
});
