import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { compileStyle, compileStyles } from '../src/styles.js';
import { parseSize } from '../src/cli.js';

async function tmpFile(name, content) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tarmdas-css-'));
  const file = path.join(dir, name);
  await writeFile(file, content);
  return file;
}

test('原生 CSS 直接讀取', async () => {
  const file = await tmpFile('a.css', 'body{color:red}');
  assert.equal(await compileStyle(file), 'body{color:red}');
});

test('SCSS 編譯巢狀與變數', async () => {
  const file = await tmpFile('a.scss', '$c:#d6336c;\nbody{h1{color:$c}}');
  const css = await compileStyle(file);
  assert.ok(css.includes('#d6336c'));
  assert.ok(css.includes('body h1'), '巢狀應展開');
});

test('LESS 編譯變數', async () => {
  const file = await tmpFile('a.less', '@c:#1c7ed6; body h2{color:@c}');
  const css = await compileStyle(file);
  assert.ok(css.includes('#1c7ed6'));
});

test('不支援的副檔名拋錯', async () => {
  const file = await tmpFile('a.styl', 'x');
  await assert.rejects(() => compileStyle(file), /不支援的樣式副檔名/);
});

test('compileStyles 串接多檔', async () => {
  const a = await tmpFile('a.css', '.a{}');
  const b = await tmpFile('b.css', '.b{}');
  const css = await compileStyles([a, b]);
  assert.ok(css.includes('.a{}') && css.includes('.b{}'));
});

test('parseSize 支援 k/m/g 後綴', () => {
  assert.equal(parseSize('1024'), 1024);
  assert.equal(parseSize('5m'), 5 * 1024 * 1024);
  assert.equal(parseSize('512k'), 512 * 1024);
  assert.equal(parseSize('1g'), 1024 ** 3);
});
