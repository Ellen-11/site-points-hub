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
