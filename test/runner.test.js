import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCheckin, formatNewApiQuota, valueAt } from '../src/runner.js';

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
