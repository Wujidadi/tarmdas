import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';

import { findConfig, loadConfig, CONFIG_FILENAME } from '../src/config.js';
import { cssLength } from '../src/convert.js';

async function tmpProject(config, sub = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'tarmdas-cfg-'));
  if (config != null) {
    const content = typeof config === 'string' ? config : JSON.stringify(config);
    await writeFile(path.join(root, CONFIG_FILENAME), content);
  }
  const dir = sub ? path.join(root, sub) : root;
  if (sub) await mkdir(dir, { recursive: true });
  return { root, dir };
}

test('findConfig finds the config file at the same level', async () => {
  const { root, dir } = await tmpProject({});
  assert.equal(await findConfig(dir), path.join(root, CONFIG_FILENAME));
});

test('findConfig searches upward from a subdirectory', async () => {
  const { root, dir } = await tmpProject({}, 'docs/guide');
  assert.equal(await findConfig(dir), path.join(root, CONFIG_FILENAME));
});

test('findConfig returns null when nothing is found (deep temp dir without a config file)', async () => {
  const { dir } = await tmpProject(null, 'docs');
  assert.equal(await findConfig(dir), null);
});

test('loadConfig returns an empty object when no config file is found', async () => {
  const { dir } = await tmpProject(null, 'docs');
  const { config, configPath } = await loadConfig(dir);
  assert.deepEqual(config, {});
  assert.equal(configPath, null);
});

test('loadConfig reads the fields', async () => {
  const { dir } = await tmpProject({ theme: 'github-dark', maxWidth: '1400px', fontSize: 15, breaks: true });
  const { config } = await loadConfig(dir);
  assert.equal(config.theme, 'github-dark');
  assert.equal(config.maxWidth, '1400px');
  assert.equal(config.fontSize, 15);
  assert.equal(config.breaks, true);
});

test('loadConfig normalizes a css string into an array, resolving relative paths against the config dir', async () => {
  const { root, dir } = await tmpProject({ css: './style/extra.scss' }, 'docs');
  const { config } = await loadConfig(dir);
  assert.deepEqual(config.css, [path.join(root, 'style', 'extra.scss')]);
});

test('loadConfig resolves a relative basedir against the config dir', async () => {
  const { root, dir } = await tmpProject({ basedir: './plan' }, 'docs');
  const { config } = await loadConfig(dir);
  assert.equal(config.basedir, path.join(root, 'plan'));
});

test('loadConfig expands a leading ~ in basedir to the home directory', async () => {
  const { dir } = await tmpProject({ basedir: '~/Documents/Work' });
  const { config } = await loadConfig(dir);
  assert.equal(config.basedir, path.join(homedir(), 'Documents', 'Work'));
});

test('loadConfig throws on unknown fields', async () => {
  const { dir } = await tmpProject({ them: 'github-dark' });
  await assert.rejects(() => loadConfig(dir), /unknown field\(s\): them/);
});

test('loadConfig throws on invalid JSON', async () => {
  const { dir } = await tmpProject('{ theme: ');
  await assert.rejects(() => loadConfig(dir), /Cannot parse config file/);
});

test('loadConfig throws when the top level is not an object', async () => {
  const { dir } = await tmpProject('["github"]');
  await assert.rejects(() => loadConfig(dir), /JSON object at the top level/);
});

test('cssLength appends px to bare numbers and passes everything else through', () => {
  assert.equal(cssLength(1400), '1400px');
  assert.equal(cssLength('15'), '15px');
  assert.equal(cssLength('0.9'), '0.9px');
  assert.equal(cssLength('90ch'), '90ch');
  assert.equal(cssLength(' 1.2rem '), '1.2rem');
});
