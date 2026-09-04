import crypto from 'node:crypto';

function signature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(secret, expiresAt = Date.now() + 86400000) {
  const expiry = String(expiresAt);
  return `${expiry}.${signature(expiry, secret)}`;
}

export function validSession(token, secret, now = Date.now()) {
  if (!token) return false;
  const [expiry, supplied, extra] = String(token).split('.');
  if (extra !== undefined || !expiry || !supplied || Number(expiry) <= now) return false;
  const expected = signature(expiry, secret);
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
