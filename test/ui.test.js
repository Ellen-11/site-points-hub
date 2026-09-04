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
