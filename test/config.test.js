import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

test('findConfig 於同層找到配置檔', async () => {
  const { root, dir } = await tmpProject({});
  assert.equal(await findConfig(dir), path.join(root, CONFIG_FILENAME));
});

test('findConfig 自子目錄向上尋找', async () => {
  const { root, dir } = await tmpProject({}, 'docs/guide');
  assert.equal(await findConfig(dir), path.join(root, CONFIG_FILENAME));
});

test('findConfig 找不到時回傳 null（深層暫存目錄無配置檔）', async () => {
  const { dir } = await tmpProject(null, 'docs');
  assert.equal(await findConfig(dir), null);
});

test('loadConfig 找不到配置檔時回傳空物件', async () => {
  const { dir } = await tmpProject(null, 'docs');
  const { config, configPath } = await loadConfig(dir);
  assert.deepEqual(config, {});
  assert.equal(configPath, null);
});

test('loadConfig 讀取欄位', async () => {
  const { dir } = await tmpProject({ theme: 'github-dark', maxWidth: '1400px', fontSize: 15, breaks: true });
  const { config } = await loadConfig(dir);
  assert.equal(config.theme, 'github-dark');
  assert.equal(config.maxWidth, '1400px');
  assert.equal(config.fontSize, 15);
  assert.equal(config.breaks, true);
});

test('loadConfig 將 css 字串正規化為陣列並以配置檔目錄解析相對路徑', async () => {
  const { root, dir } = await tmpProject({ css: './style/extra.scss' }, 'docs');
  const { config } = await loadConfig(dir);
  assert.deepEqual(config.css, [path.join(root, 'style', 'extra.scss')]);
});

test('loadConfig 對未知欄位拋錯', async () => {
  const { dir } = await tmpProject({ them: 'github-dark' });
  await assert.rejects(() => loadConfig(dir), /未知欄位：them/);
});

test('loadConfig 對非法 JSON 拋錯', async () => {
  const { dir } = await tmpProject('{ theme: ');
  await assert.rejects(() => loadConfig(dir), /無法解析配置檔/);
});

test('loadConfig 對非物件頂層拋錯', async () => {
  const { dir } = await tmpProject('["github"]');
  await assert.rejects(() => loadConfig(dir), /頂層必須是 JSON 物件/);
});

test('cssLength 純數字補 px、其餘原樣', () => {
  assert.equal(cssLength(1400), '1400px');
  assert.equal(cssLength('15'), '15px');
  assert.equal(cssLength('0.9'), '0.9px');
  assert.equal(cssLength('90ch'), '90ch');
  assert.equal(cssLength(' 1.2rem '), '1.2rem');
});
