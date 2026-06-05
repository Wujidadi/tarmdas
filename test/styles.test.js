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

test('plain CSS is read as is', async () => {
  const file = await tmpFile('a.css', 'body{color:red}');
  assert.equal(await compileStyle(file), 'body{color:red}');
});

test('SCSS compiles nesting and variables', async () => {
  const file = await tmpFile('a.scss', '$c:#d6336c;\nbody{h1{color:$c}}');
  const css = await compileStyle(file);
  assert.ok(css.includes('#d6336c'));
  assert.ok(css.includes('body h1'), 'nesting should be expanded');
});

test('LESS compiles variables', async () => {
  const file = await tmpFile('a.less', '@c:#1c7ed6; body h2{color:@c}');
  const css = await compileStyle(file);
  assert.ok(css.includes('#1c7ed6'));
});

test('unsupported extensions throw', async () => {
  const file = await tmpFile('a.styl', 'x');
  await assert.rejects(() => compileStyle(file), /Unsupported stylesheet extension/);
});

test('compileStyles concatenates multiple files', async () => {
  const a = await tmpFile('a.css', '.a{}');
  const b = await tmpFile('b.css', '.b{}');
  const css = await compileStyles([a, b]);
  assert.ok(css.includes('.a{}') && css.includes('.b{}'));
});

test('parseSize supports k/m/g suffixes', () => {
  assert.equal(parseSize('1024'), 1024);
  assert.equal(parseSize('5m'), 5 * 1024 * 1024);
  assert.equal(parseSize('512k'), 512 * 1024);
  assert.equal(parseSize('1g'), 1024 ** 3);
});
