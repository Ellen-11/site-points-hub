import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteAlertsView, readInviteCount, recordInviteCount } from '../src/invite-alerts.js';

test('recognizes common invitation count fields', () => {
  assert.equal(readInviteCount({ data: { aff_count: 3 } }), 3);
  assert.equal(readInviteCount({ data: { inviteCount: '4' } }), 4);
  assert.equal(readInviteCount({ user: { referral_count: 5 } }), 5);
  assert.equal(readInviteCount({ data: { referralCredits: 100 } }), null);
});

test('first invitation count creates a baseline and later increase creates an alert', () => {
  const account = { id: 'a', name: 'A' }; const db = { accounts: [account] };
  assert.equal(recordInviteCount(db, account, 2, new Date('2026-09-06T00:00:00Z')), null);
  const alert = recordInviteCount(db, account, 4, new Date('2026-09-06T01:00:00Z'));
  assert.equal(alert.addedCount, 2);
  assert.equal(inviteAlertsView(db).unreadCount, 1);
  assert.equal(inviteAlertsView(db).totalCount, 4);
  assert.deepEqual(inviteAlertsView(db).counts.map(item => [item.accountName, item.count]), [['A', 4]]);
});

test('invitation view exposes a per-site breakdown ordered by count', () => {
  const db = { accounts: [
    { id: 'a', name: 'A', inviteCount: 2 },
    { id: 'b', name: 'B', inviteCount: 5 },
    { id: 'c', name: 'C' }
  ], inviteWatch: { alerts: [] } };
  const view = inviteAlertsView(db);
  assert.equal(view.totalCount, 7);
  assert.deepEqual(view.counts.map(item => [item.accountName, item.count]), [['B', 5], ['A', 2]]);
});

test('a lower or unchanged invitation count only updates the baseline', () => {
  const account = { id: 'a', name: 'A', inviteCount: 4 }; const db = { accounts: [account], inviteWatch: { alerts: [] } };
  assert.equal(recordInviteCount(db, account, 4), null);
  assert.equal(recordInviteCount(db, account, 1), null);
  assert.equal(db.inviteWatch.alerts.length, 0);
});
