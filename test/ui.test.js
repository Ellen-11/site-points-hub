import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('add-site action clears the previous edit id', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /form\.elements\.id\.value\s*=\s*''/);
});

test('site cards include a safe external link', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /class="site-link"/);
  assert.match(source, /rel="noopener noreferrer"/);
});

test('expired login hides the stale dashboard', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /\$\('#app'\)\.classList\.add\('hidden'\)/);
  assert.match(source, /\$\('#logout'\)\.classList\.add\('hidden'\)/);
});

test('login explicitly sends cookies and shows progress', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /credentials:\s*'same-origin'/);
  assert.match(source, /正在登录/);
  assert.match(source, /await load\(\)/);
});

test('dashboard accepts accounts without a selected model price', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!price\?\.text\) return ''/);
});

test('model picker preserves amount billing instead of forcing per-call', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /localStorage\.getItem\('modelBilling'\)/);
  assert.match(source, /localStorage\.setItem\('modelBilling', billing\)/);
  assert.match(source, /setBilling\(activeBilling\)/);
  assert.doesNotMatch(source, /preferredBilling/);
});

test('custom bearer accounts can save automatic refresh settings', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /name="refreshPath"/);
  assert.match(html, /name="refreshCookie"/);
  assert.match(html, /遇到 401/);
  assert.match(html, /name="pricingCookie"/);
  assert.match(html, /name="modelBaseUrl"/);
  assert.match(html, /GET \/v1\/models/);
});

test('server browser feature is fully removed', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const runner = fs.readFileSync(new URL('../src/runner.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.equal(fs.existsSync(new URL('../src/browser.js', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../start-container.sh', import.meta.url)), false);
  assert.doesNotMatch(server, /browser-open|BROWSER_CDP_URL|BROWSER_WEB_ROOT|websockify|browserAvailable|openBrowserLogin/);
  assert.doesNotMatch(runner, /\brefreshInBrowser\b|\brefreshMode\b/);
  assert.doesNotMatch(html, /refreshMode|服务器浏览器/);
  assert.doesNotMatch(source, /openServerBrowser|browser-open/);
  assert.doesNotMatch(dockerfile, /chromium|xvfb|x11vnc|novnc|websockify/);
});

test('account save reports server validation errors and shows progress', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="accountSaveError"/);
  assert.match(source, /正在保存/);
  assert.match(source, /accountSaveError'\)\.textContent = error\.message/);
});

test('site cards include a real model invocation test', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, />测试模型</);
  assert.match(source, /\/model-test/);
  assert.match(source, /本次已真实调用/);
});

test('polling is controlled by account tags', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /#pollTags/);
  assert.match(source, /#addTagForm/);
  assert.match(source, /openTagPicker/);
  assert.match(source, /\/tags/);
  assert.match(source, /togglePollTag/);
  assert.doesNotMatch(source, /参与轮询<\/label>/);
});

test('tag filter and order controls are available', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /setTagFilter/);
  assert.match(source, /draggable="true"/);
  assert.match(source, /dropAccount/);
  assert.match(source, /\/api\/accounts\/order/);
  assert.doesNotMatch(source, /↑ 上移/);
  assert.doesNotMatch(source, /↓ 下移/);
});

test('created tags can be deleted with confirmation', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /deleteTag/);
  assert.match(source, /确定删除标签/);
  assert.match(source, /method: 'DELETE'/);
});

test('batch actions visibly run tagged sites one by one', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /async function runBatch/);
  assert.match(source, /for \(let index = 0; index < targets\.length/);
  assert.match(source, /正在.*\$\{index \+ 1\}\/\$\{targets\.length\}/);
  assert.match(source, /const targets = currentVisible\(\)/);
  assert.match(source, /当前筛选下没有可执行的站点/);
});

test('check-in is recorded manually with a filter for unchecked sites', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const runner = fs.readFileSync(new URL('../src/runner.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(server, /checkin-record/);
  assert.match(server, /checkinState: x\.checkinDate === today \? 'checked' : 'unchecked'/);
  assert.doesNotMatch(server, /AUTO_CHECKIN_HOUR/);
  assert.doesNotMatch(server, /runAll\('checkin'\)/);
  assert.match(server, /req\.params\.action !== 'poll'/);
  assert.doesNotMatch(server, /'already'/);
  assert.doesNotMatch(runner, /classifyCheckin|checkinPath/);
  assert.doesNotMatch(html, /name="checkinPath"/);
  assert.doesNotMatch(html, /value="already"/);
  assert.match(html, /id="filterCheckin"/);
  assert.match(html, /id="uncheckAll"/);
  assert.match(source, /recordCheckin/);
  assert.match(source, /setCheckinFilter/);
  assert.match(source, /account\.checkinState === checkinFilter/);
  assert.doesNotMatch(source, /'checkin'\)/);
});

test('run logs distinguish gateway traffic', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /run\.action === 'gateway' \? '网关'/);
});

test('left navigation keeps only dashboard and run logs', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(fs.existsSync(new URL('../src/stats.js', import.meta.url)), false);
  assert.doesNotMatch(html, /statsView|调用统计|trendChart|statsAccount|statsModel|ranking/);
  assert.doesNotMatch(source, /loadStats|\/api\/stats/);
});

test('left navigation includes filterable run logs', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, />运行日志</);
  assert.match(html, /id="logAction"/);
  assert.match(html, /id="logStatus"/);
  assert.match(html, /id="logAccount"/);
  assert.match(source, /\/api\/logs\?/);
});

test('public invite preview exposes only chosen names and links', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const invites = fs.readFileSync(new URL('../public/invites.js', import.meta.url), 'utf8');
  assert.match(html, /name="inviteUrl"/);
  assert.match(html, /href="\/invites\.html"/);
  assert.match(invites, /item\.name/);
  assert.match(invites, /item\.tags/);
  assert.match(invites, /item\.url/);
  assert.doesNotMatch(invites, /balance|apiKey|credential|modelName/);
});
