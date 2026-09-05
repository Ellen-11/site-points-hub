import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = process.env.DATA_DIR || './data';
const file = path.join(dir, 'store.json');
const secret = process.env.APP_SECRET || 'development-only-secret';
const key = crypto.scryptSync(secret, 'site-points-hub', 32);

const blank = () => ({ accounts: [], runs: [], tags: [], pollTags: [] });

export function readStore() {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) return blank();
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return blank(); }
}

export function writeStore(data) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function mutateStore(mutator) {
  const data = readStore();
  const result = mutator(data);
  writeStore(data);
  return result;
}

export function encrypt(value = '') {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(x => x.toString('base64url')).join('.');
}

export function decrypt(value = '') {
  if (!value) return '';
  const [iv, tag, body] = value.split('.').map(x => Buffer.from(x, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
