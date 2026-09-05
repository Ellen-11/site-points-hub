import crypto from 'node:crypto';
import { readStore, writeStore } from './store.js';

const MAX_ALERTS = 300;
const COUNT_KEYS = new Set(['affcount', 'invitecount', 'invitedcount', 'referralcount']);

export function readInviteCount(data) {
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return null;
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
      if (COUNT_KEYS.has(normalized)) {
        const count = Number(child);
        if (Number.isFinite(count) && count >= 0) return Math.trunc(count);
      }
    }
    for (const child of Object.values(value)) {
      const found = visit(child, depth + 1);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(data);
}

export function recordInviteCount(db, account, count, now = new Date()) {
  const current = Number(count);
  if (!Number.isFinite(current) || current < 0) return null;
  const normalized = Math.trunc(current);
  const hadBaseline = account.inviteCount !== undefined && account.inviteCount !== null && Number.isFinite(Number(account.inviteCount));
  const previous = hadBaseline ? Math.trunc(Number(account.inviteCount)) : null;
  account.inviteCount = normalized;
  account.inviteCountCheckedAt = now.toISOString();
  if (!hadBaseline || normalized <= previous) return null;

  const alert = {
    id: crypto.randomUUID(), unread: true, accountId: account.id, accountName: account.name,
    previousCount: previous, currentCount: normalized, addedCount: normalized - previous,
    detectedAt: now.toISOString()
  };
  db.inviteWatch ||= { alerts: [] };
  db.inviteWatch.alerts = [alert, ...(db.inviteWatch.alerts || [])].slice(0, MAX_ALERTS);
  return alert;
}

export function inviteAlertsView(db = readStore()) {
  const alerts = [...(db.inviteWatch?.alerts || [])].sort((a, b) => String(b.detectedAt || '').localeCompare(String(a.detectedAt || '')));
  const monitored = (db.accounts || []).filter(account => Number.isFinite(Number(account.inviteCount)) && account.inviteCount !== null);
  const sites = new Map((db.accounts || []).map(account => [account.id, account.name]));
  for (const alert of alerts) if (alert.accountId && alert.accountName) sites.set(alert.accountId, alert.accountName);
  const lastCheckedAt = monitored.map(account => account.inviteCountCheckedAt || '').sort().at(-1) || null;
  return {
    alerts,
    unreadCount: alerts.filter(alert => alert.unread !== false).length,
    monitoredCount: monitored.length,
    totalCount: monitored.reduce((sum, account) => sum + Math.max(0, Math.trunc(Number(account.inviteCount))), 0),
    sites: [...sites].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    lastCheckedAt
  };
}

export function dismissInviteAlert(id) {
  const db = readStore();
  const alerts = db.inviteWatch?.alerts || [];
  const remaining = alerts.filter(alert => alert.id !== id);
  if (remaining.length === alerts.length) throw Error('提醒不存在');
  db.inviteWatch.alerts = remaining;
  writeStore(db);
  return inviteAlertsView(db);
}

export function clearInviteAlerts() {
  const db = readStore();
  db.inviteWatch ||= {};
  db.inviteWatch.alerts = [];
  writeStore(db);
  return inviteAlertsView(db);
}
