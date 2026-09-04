import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelCatalog, buildPerCallCatalog, classifyCheckin, estimateAccountCalls, estimateRemainingCalls, formatNewApiQuota, formatQuota, modelCategory, pricingAuthType, readRemainingQuota, shouldPoll, summarizeModelPrice, valueAt } from '../src/runner.js';

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

test('distinguishes per-call and token model pricing', () => {
  assert.equal(summarizeModelPrice({ model_name: 'image', quota_type: 1, model_price: 0.03 }).text, '$0.0300 / 次');
  assert.equal(summarizeModelPrice({ model_name: 'chat', quota_type: 0, model_ratio: 1.25, completion_ratio: 4 }, 500000).text, '输入 $2.5000 / 1M · 输出 $10.0000 / 1M');
});

test('pricing reuses each panel login authentication', () => {
  assert.equal(pricingAuthType({ panelType: 'generic' }), 'generic');
  assert.equal(pricingAuthType({ panelType: 'auto' }), 'newapi');
  assert.equal(pricingAuthType({ panelType: 'newapi' }), 'newapi');
});

test('only checked sites participate in polling', () => {
  assert.equal(shouldPoll({ enabled: true }), true);
  assert.equal(shouldPoll({ enabled: true, pollEnabled: true }), true);
  assert.equal(shouldPoll({ enabled: true, pollEnabled: false }), false);
});

test('categorizes and keeps only available per-call models', () => {
  const models = { data: [{ id: 'gpt-image-1' }, { id: 'gemini-2.5-pro' }, { id: 'token-model' }] };
  const pricing = { data: [
    { model_name: 'gpt-image-1', quota_type: 1, model_price: 0.04 },
    { model_name: 'gemini-2.5-pro', quota_type: 1, model_price: 0.02 },
    { model_name: 'token-model', quota_type: 0, model_ratio: 1 }
  ] };
  assert.deepEqual(buildPerCallCatalog(models, pricing).map(x => [x.name, x.category]), [['gemini-2.5-pro', 'Gemini'], ['gpt-image-1', 'GPT']]);
  assert.equal(modelCategory('claude-3-opus'), 'Claude');
});

test('supports custom quota-per-call pricing responses', () => {
  const models = { data: [{ id: 'gemini-2.5-pro' }, { id: 'token-model' }] };
  const pricing = { data: { models: [
    { name: 'gemini-2.5-pro', priceLabel: '200 额度/次', priceType: 'call', priceValue: 200, quotaType: 1 },
    { name: 'token-model', priceLabel: '3 额度/1K tokens', priceType: 'token', priceValue: 3, quotaType: 0 }
  ] } };
  assert.deepEqual(buildPerCallCatalog(models, pricing), [{ name: 'gemini-2.5-pro', category: 'Gemini', price: 200, priceUnit: 'quota', text: '200 额度/次' }]);
});

test('includes token-priced models in the amount catalog', () => {
  const models = { data: [{ id: 'gpt-5.4' }] };
  const pricing = { data: { models: [{ name: 'gpt-5.4', priceLabel: '5 额度/1K tokens', priceType: 'token', priceValue: 5, quotaType: 0 }] } };
  assert.deepEqual(buildModelCatalog(models, pricing), [{ name: 'gpt-5.4', category: 'GPT', billing: 'token', price: 5, text: '5 额度/1K tokens' }]);
});

test('estimates remaining uses for per-call models', () => {
  assert.equal(estimateRemainingCalls(24495, { billing: 'call', price: 200, priceUnit: 'quota' }), 122);
  assert.equal(estimateRemainingCalls(5000000, { billing: 'call', price: 2, priceUnit: 'usd' }, 500000), 5);
  assert.equal(estimateRemainingCalls(0, { billing: 'call', price: 0, priceUnit: 'quota' }), 'unlimited');
  assert.equal(estimateRemainingCalls(null, { billing: 'call', price: 200, priceUnit: 'quota' }), null);
  assert.equal(estimateRemainingCalls(24495, { billing: 'token', price: 200, priceUnit: 'quota' }), null);
  assert.equal(estimateAccountCalls({ balance: '24,495.00', quotaPerUnit: 1 }, { billing: 'call', price: 200, priceUnit: 'quota' }), 122);
  assert.equal(estimateAccountCalls({ balance: '$10.00', quotaPerUnit: 500000 }, { billing: 'call', price: 2, priceUnit: 'usd' }), 5);
});
