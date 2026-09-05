import crypto from 'node:crypto';
import { readStore, writeStore } from './store.js';
import { refreshModelCatalog } from './runner.js';

const MAX_ALERTS = 300;
let activeScan = null;

export function canonicalModelName(name) {
  return String(name || '').trim().toLowerCase();
}

export function normalizedPerCallPrice(account, model) {
  if (model?.billing !== 'call') return null;
  const price = Number(model.price);
  if (!Number.isFinite(price) || price < 0) return null;
  if (model.priceUnit === 'quota') {
    const quotaPerUnit = Number(account?.quotaPerUnit);
    return Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? price / quotaPerUnit : null;
  }
  return !model.priceUnit || model.priceUnit === 'usd' ? price : null;
}

export function buildPriceLeaders(accounts = []) {
  const leaders = new Map();
  for (const account of accounts) {
    for (const model of account.models || []) {
      const key = canonicalModelName(model.name);
      const priceUsd = normalizedPerCallPrice(account, model);
      if (!key || priceUsd === null) continue;
      const candidate = { key, modelName: model.name, priceUsd, accountId: account.id, accountName: account.name, checkedAt: account.modelsCheckedAt || null };
      const current = leaders.get(key);
      if (!current || candidate.priceUsd < current.priceUsd || (candidate.priceUsd === current.priceUsd && candidate.accountName.localeCompare(current.accountName) < 0)) leaders.set(key, candidate);
    }
  }
  return [...leaders.values()].sort((a, b) => a.modelName.localeCompare(b.modelName));
}

export function updatePriceWatchState(db, leaders, now = new Date()) {
  const previous = db.priceWatch || {};
  const initialized = previous.initialized === true;
  const oldLeaders = previous.leaders || {};
  const nextLeaders = Object.fromEntries(leaders.map(item => [item.key, item]));
  const alerts = Array.isArray(previous.alerts) ? previous.alerts : [];
  const created = [];
  for (const current of leaders) {
    const old = oldLeaders[current.key];
    const isNewModel = initialized && !old;
    const isCheaper = old && current.priceUsd < old.priceUsd - 1e-12;
    if (!isNewModel && !isCheaper) continue;
    created.push({
      id: crypto.randomUUID(), unread: true, kind: isNewModel ? 'new' : 'drop', modelName: current.modelName,
      oldPriceUsd: old?.priceUsd ?? null, newPriceUsd: current.priceUsd,
      oldAccountName: old?.accountName || '', accountId: current.accountId, accountName: current.accountName,
      detectedAt: now.toISOString()
    });
  }
  db.priceWatch = {
    ...previous, initialized: true, leaders: nextLeaders,
    alerts: [...created.reverse(), ...alerts].slice(0, MAX_ALERTS),
    lastCheckedAt: now.toISOString()
  };
  return created;
}

export function priceAlertsView(db = readStore()) {
  const watch = db.priceWatch || {};
  const alerts = Array.isArray(watch.alerts) ? watch.alerts : [];
  return {
    leaders: Object.values(watch.leaders || {}).sort((a, b) => a.modelName.localeCompare(b.modelName)),
    alerts,
    unreadCount: alerts.filter(alert => alert.unread).length,
    initialized: watch.initialized === true,
    lastCheckedAt: watch.lastCheckedAt || null,
    lastScan: watch.lastScan || null
  };
}

async function performPriceScan() {
  const snapshot = readStore();
  const candidates = snapshot.accounts.filter(account => account.enabled !== false && (account.models || []).some(model => model.billing === 'call'));
  const errors = [];
  let refreshed = 0;
  for (const account of candidates) {
    try { await refreshModelCatalog(account.id); refreshed++;
    } catch (error) { errors.push({ accountId: account.id, accountName: account.name, message: error.message }); }
  }
  const db = readStore();
  const now = new Date();
  const leaders = buildPriceLeaders(db.accounts);
  const created = updatePriceWatchState(db, leaders, now);
  db.priceWatch.lastScan = { monitored: candidates.length, refreshed, failed: errors.length, errors: errors.slice(0, 30) };
  writeStore(db);
  return { ...priceAlertsView(db), createdCount: created.length };
}

export function scanPriceAlerts() {
  if (activeScan) return activeScan;
  activeScan = performPriceScan().finally(() => { activeScan = null; });
  return activeScan;
}

export function markPriceAlertsRead() {
  const db = readStore();
  if (db.priceWatch?.alerts) db.priceWatch.alerts.forEach(alert => { alert.unread = false; });
  writeStore(db);
  return priceAlertsView(db);
}

export function clearPriceAlerts() {
  const db = readStore();
  if (db.priceWatch) db.priceWatch.alerts = [];
  writeStore(db);
  return priceAlertsView(db);
}
