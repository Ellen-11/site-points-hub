import express from 'express';
import crypto from 'node:crypto';
import { encrypt, readStore, writeStore } from './store.js';
import { runAccount, runAll } from './runner.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const password = process.env.ADMIN_PASSWORD || 'admin';
const sessions = new Map();
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));

function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('='))); }
function auth(req, res, next) { const s = sessions.get(cookies(req).session); if (!s || s < Date.now()) return res.status(401).json({ error: '请先登录' }); next(); }
app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/api/login', (req, res) => {
  const a = Buffer.from(String(req.body.password || '')); const b = Buffer.from(password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: '密码错误' });
  const token = crypto.randomBytes(24).toString('base64url'); sessions.set(token, Date.now() + 86400000);
  res.setHeader('set-cookie', `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/logout', auth, (req, res) => { sessions.delete(cookies(req).session); res.setHeader('set-cookie', 'session=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/dashboard', auth, (_req, res) => {
  const db = readStore();
  res.json({ accounts: db.accounts.map(({ credential, ...x }) => ({ ...x, hasCredential: Boolean(credential) })), runs: db.runs.slice(0, 30) });
});
app.post('/api/accounts', auth, (req, res) => {
  const b = req.body;
  if (!b.name || !b.baseUrl || !b.balancePath) return res.status(400).json({ error: '名称、站点地址和余额接口必填' });
  const db = readStore(); const old = b.id && db.accounts.find(x => x.id === b.id);
  const account = { ...old, id: old?.id || crypto.randomUUID(), name: b.name.trim(), baseUrl: b.baseUrl.trim(), balancePath: b.balancePath.trim(), balanceField: b.balanceField || 'balance', checkinPath: b.checkinPath?.trim() || '', checkinMethod: b.checkinMethod || 'POST', authType: b.authType || 'bearer', headerName: b.headerName || '', enabled: b.enabled !== false, credential: b.credential ? encrypt(b.credential) : old?.credential || '', updatedAt: new Date().toISOString() };
  if (old) db.accounts[db.accounts.indexOf(old)] = account; else db.accounts.push(account);
  writeStore(db); res.json({ ok: true, id: account.id });
});
app.delete('/api/accounts/:id', auth, (req, res) => { const db = readStore(); db.accounts = db.accounts.filter(x => x.id !== req.params.id); writeStore(db); res.json({ ok: true }); });
app.post('/api/accounts/:id/:action', auth, async (req, res) => { try { res.json(await runAccount(req.params.id, req.params.action)); } catch (e) { res.status(400).json({ error: e.message }); } });
app.post('/api/run-all/:action', auth, async (req, res) => { await runAll(req.params.action); res.json({ ok: true }); });

let lastCheckinDate = '';
setInterval(async () => {
  await runAll('poll');
  const now = new Date(); const hour = Number(process.env.AUTO_CHECKIN_HOUR ?? 8); const date = now.toLocaleDateString('sv-SE', { timeZone: process.env.TZ || 'Asia/Shanghai' });
  const localHour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false, timeZone: process.env.TZ || 'Asia/Shanghai' }).format(now));
  if (localHour === hour && lastCheckinDate !== date) { lastCheckinDate = date; await runAll('checkin'); }
}, Math.max(1, Number(process.env.POLL_INTERVAL_MINUTES || 30)) * 60000).unref();

app.listen(port, '0.0.0.0', () => console.log(`Site Points Hub listening on ${port}`));
