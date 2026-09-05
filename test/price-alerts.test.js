import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOneConnectorPriceLeaders, buildPriceLeaders, buildSitePrices, canonicalModelName, comparableModelName, normalizedPerCallPrice, oneConnectorModelName, updatePinnedPriceAlerts, updatePriceWatchState } from '../src/price-alerts.js';

test('price leaders compare only the same exact model name', () => {
  const accounts = [
    { id: 'a', name: 'A', quotaPerUnit: 500000, models: [{ name: 'gpt-5.5', billing: 'call', price: 0.03, priceUnit: 'usd' }, { name: 'gpt-5.6', billing: 'call', price: 0.01, priceUnit: 'usd' }] },
    { id: 'b', name: 'B', quotaPerUnit: 500000, models: [{ name: 'GPT-5.5', billing: 'call', price: 0.02, priceUnit: 'usd' }] }
  ];
  const leaders = buildPriceLeaders(accounts);
  assert.equal(canonicalModelName(' GPT-5.5 '), 'gpt-5.5');
  assert.equal(leaders.length, 2);
  assert.equal(leaders.find(item => item.key === 'gpt-5.5').accountName, 'B');
  assert.equal(leaders.find(item => item.key === 'gpt-5.6').accountName, 'A');
});

test('price leaders group models whose first three hyphen parts match', () => {
  const accounts = [
    { id: 'a', name: 'A', models: [{ name: 'gemini-3.1-pro-high', billing: 'call', price: 0.03, priceUnit: 'usd' }] },
    { id: 'b', name: 'B', models: [{ name: 'gemini-3.1-pro-low', billing: 'call', price: 0.01, priceUnit: 'usd' }, { name: 'gemini-3.0-pro-low', billing: 'call', price: 0.02, priceUnit: 'usd' }] }
  ];
  const leaders = buildPriceLeaders(accounts);
  assert.equal(comparableModelName('gemini-3.1-pro-high'), 'gemini-3.1-pro');
  assert.equal(leaders.length, 2);
  assert.equal(leaders.find(item => item.key === 'gemini-3.1-pro').modelName, 'gemini-3.1-pro-low');
  assert.equal(leaders.find(item => item.key === 'gemini-3.1-pro').accountName, 'B');
  assert.equal(leaders.find(item => item.key === 'gemini-3.0-pro').modelName, 'gemini-3.0-pro-low');
});

test('one-connector scan compares base and suffixed model names as a separate group', () => {
  const leaders = buildOneConnectorPriceLeaders([
    { id: 'a', name: 'A', models: [{ name: 'gpt-5.5', billing: 'call', price: 0.03, priceUnit: 'usd' }] },
    { id: 'b', name: 'B', models: [{ name: 'gpt-5.5-free', billing: 'call', price: 0.01, priceUnit: 'usd' }] }
  ]);
  assert.equal(oneConnectorModelName('gpt-5.5-free'), 'gpt-5.5');
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0].scope, 'broad');
  assert.equal(leaders[0].modelName, 'gpt-5.5-free');
});

test('one-connector scan initializes independently without flooding alerts', () => {
  const db = { priceWatch: { initialized: true, leaders: {}, alerts: [] } };
  const leaders = [{ key: 'gpt-5.5', scope: 'broad', modelName: 'gpt-5.5-free', priceUsd: 0.01, accountId: 'b', accountName: 'B' }];
  const created = updatePriceWatchState(db, leaders, new Date('2026-09-06T03:00:00Z'), 'broad');
  assert.equal(created.length, 0);
  assert.equal(db.priceWatch.broadInitialized, true);
  assert.ok(db.priceWatch.broadLeaders['gpt-5.5']);
});

test('migrates exact-name price baselines into comparison groups without a false new-model alert', () => {
  const db = { priceWatch: { initialized: true, leaders: {
    'gemini-3.1-pro-high': { key: 'gemini-3.1-pro-high', modelName: 'gemini-3.1-pro-high', priceUsd: 0.03, accountName: 'A' }
  }, alerts: [] } };
  const created = updatePriceWatchState(db, [{ key: 'gemini-3.1-pro', comparisonName: 'gemini-3.1-pro', modelName: 'gemini-3.1-pro-low', priceUsd: 0.03, accountId: 'b', accountName: 'B' }], new Date('2026-09-05T03:00:00Z'));
  assert.equal(created.length, 0);
  assert.ok(db.priceWatch.leaders['gemini-3.1-pro']);
});

test('site price lists keep each site available for filtering', () => {
  const prices = buildSitePrices([
    { id: 'a', name: 'A', models: [{ name: 'gemini-3.1-pro-high', billing: 'call', price: 0.03, priceUnit: 'usd' }, { name: 'gemini-3.1-pro-low', billing: 'call', price: 0.02, priceUnit: 'usd' }] },
    { id: 'b', name: 'B', models: [{ name: 'gemini-3.1-pro-low', billing: 'call', price: 0.01, priceUnit: 'usd' }] }
  ]);
  assert.equal(prices.length, 2);
  assert.equal(prices.find(item => item.accountId === 'a').priceUsd, 0.02);
  assert.equal(prices.find(item => item.accountId === 'b').priceUsd, 0.01);
});

test('quota prices are normalized to dollars before comparison', () => {
  assert.equal(normalizedPerCallPrice({ quotaPerUnit: 500000 }, { billing: 'call', price: 10000, priceUnit: 'quota' }), 0.02);
});

test('first scan creates a baseline and later lower price creates one unread alert', () => {
  const db = {};
  updatePriceWatchState(db, [{ key: 'gpt-5.5', modelName: 'gpt-5.5', priceUsd: 0.03, accountId: 'a', accountName: 'A' }], new Date('2026-09-05T00:00:00Z'));
  assert.equal(db.priceWatch.alerts.length, 0);
  updatePriceWatchState(db, [{ key: 'gpt-5.5', modelName: 'gpt-5.5', priceUsd: 0.02, accountId: 'b', accountName: 'B' }], new Date('2026-09-05T01:00:00Z'));
  assert.equal(db.priceWatch.alerts.length, 1);
  assert.equal(db.priceWatch.alerts[0].unread, true);
  updatePriceWatchState(db, [{ key: 'gpt-5.5', modelName: 'gpt-5.5', priceUsd: 0.02, accountId: 'b', accountName: 'B' }], new Date('2026-09-05T02:00:00Z'));
  assert.equal(db.priceWatch.alerts.length, 1);
});

test('pinned alert tracks price increases and model disappearance', () => {
  const alert = { id: 'notice', pinned: true, unread: false, comparisonName: 'gpt-5.5', modelName: 'gpt-5.5-fast', newPriceUsd: 0.02, currentPriceUsd: 0.02, currentModelName: 'gpt-5.5-fast', currentAccountId: 'a', accountId: 'a' };
  updatePinnedPriceAlerts([alert], [{ key: 'gpt-5.5', modelName: 'gpt-5.5-fast', priceUsd: 0.03, accountId: 'a', accountName: 'A' }], new Date('2026-09-06T00:00:00Z'));
  assert.equal(alert.watchStatus, 'up');
  assert.equal(alert.unread, true);
  assert.equal(alert.currentPriceUsd, 0.03);
  alert.unread = false;
  updatePinnedPriceAlerts([alert], [], new Date('2026-09-06T01:00:00Z'));
  assert.equal(alert.watchStatus, 'missing');
  assert.equal(alert.currentPriceUsd, null);
  assert.equal(alert.unread, true);
});

test('a pinned family updates in place instead of creating duplicate drop messages', () => {
  const db = { priceWatch: { initialized: true, leaders: { 'gpt-5.5': { key: 'gpt-5.5', modelName: 'gpt-5.5', priceUsd: 0.03, accountId: 'a', accountName: 'A' } }, alerts: [{ id: 'notice', pinned: true, unread: false, comparisonName: 'gpt-5.5', modelName: 'gpt-5.5', newPriceUsd: 0.03, currentPriceUsd: 0.03, currentModelName: 'gpt-5.5', currentAccountId: 'a', accountId: 'a' }] } };
  const created = updatePriceWatchState(db, [{ key: 'gpt-5.5', modelName: 'gpt-5.5', priceUsd: 0.02, accountId: 'b', accountName: 'B' }], new Date('2026-09-06T02:00:00Z'));
  assert.equal(created.length, 0);
  assert.equal(db.priceWatch.alerts.length, 1);
  assert.equal(db.priceWatch.alerts[0].watchStatus, 'down');
  assert.equal(db.priceWatch.alerts[0].currentAccountName, 'B');
});
