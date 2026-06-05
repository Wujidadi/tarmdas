import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getPreset, getPresetCss, mermaidInitScript, listPresets, PRESETS } from '../src/themes.js';
import { getHighlightCss } from '../src/assets.js';
import { renderDocument } from '../src/convert.js';

async function tmpDir() {
  return mkdtemp(path.join(tmpdir(), 'tarmdas-theme-'));
}

test('內建主題清單包含 github 三套與常見配色', () => {
  const names = listPresets();
  for (const expected of [
    'github', 'github-light', 'github-dark',
    'monokai', 'dracula', 'nord', 'one-dark', 'one-light',
    'gruvbox-light', 'gruvbox-dark', 'tokyo-night-light', 'tokyo-night-dark',
    'solarized-light', 'solarized-dark',
  ]) {
    assert.ok(names.includes(expected), `應包含主題 ${expected}`);
  }
});

test('每個內建主題：SCSS 可編譯且 highlight.js 主題可解析', async () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const css = await getPresetCss(name);
    assert.ok(/--fg:/.test(css), `${name} 應產生正文變數`);
    const hl = typeof preset.highlight === 'object'
      ? [preset.highlight.light, preset.highlight.dark]
      : [preset.highlight];
    for (const theme of hl) {
      const themeCss = await getHighlightCss(theme);
      assert.ok(themeCss.length > 0, `${name} 的 hljs 主題 ${theme} 應可載入`);
    }
  }
});

test('getPreset 對未知主題拋出含清單的錯誤', () => {
  assert.throws(() => getPreset('nope'), /可用主題：github/);
});

test('github-light 編譯出淺色正文變數', async () => {
  const css = await getPresetCss('github-light');
  assert.ok(css.includes('--fg: #24292f'), '應為淺色文字');
  assert.ok(css.includes('color-scheme: light'));
});

test('github-dark 編譯出深色正文變數', async () => {
  const css = await getPresetCss('github-dark');
  assert.ok(css.includes('--fg: #c9d1d9'), '應為深色文字');
  assert.ok(css.includes('color-scheme: dark'));
});

test('github（自動）同時含淺色預設與深色媒體查詢', async () => {
  const css = await getPresetCss('github');
  assert.ok(css.includes('--fg: #24292f'));
  assert.ok(css.includes('prefers-color-scheme: dark'));
  assert.ok(css.includes('--fg: #c9d1d9'));
});

test('mermaidInitScript：auto 依系統偏好、固定主題用指定值', () => {
  assert.match(mermaidInitScript('auto'), /matchMedia[\s\S]*'dark' : 'default'/);
  assert.match(mermaidInitScript('dark'), /theme: "dark"/);
  assert.match(mermaidInitScript('default'), /theme: "default"/);
});

test('mermaidInitScript：圖表字級預設與正文基準 14px 一致，並可跟隨配置字級', () => {
  assert.match(mermaidInitScript('auto'), /themeVariables: \{ fontSize: "14px" \}/);
  assert.match(mermaidInitScript('dark'), /themeVariables: \{ fontSize: "14px" \}/);
  assert.match(mermaidInitScript('dark', '15px'), /themeVariables: \{ fontSize: "15px" \}/);
});

test('renderDocument：github-dark 連動深色正文、hljs、Mermaid', async () => {
  const dir = await tmpDir();
  const src = '# 標題\n\n```js\nconst a=1;\n```\n\n```mermaid\ngraph TD\nA-->B\n```\n';
  const { html } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
    theme: 'github-dark',
  });
  assert.ok(html.includes('--fg: #c9d1d9'), '正文深色');
  assert.ok(html.includes('theme: "dark"'), 'Mermaid 深色');
  assert.ok(!html.includes('prefers-color-scheme'), '固定深色不應有媒體查詢');
});

test('renderDocument：預設 github 為自動切換', async () => {
  const dir = await tmpDir();
  const src = '```mermaid\ngraph TD\nA-->B\n```\n';
  const { html } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.ok(html.includes('prefers-color-scheme: dark'), '自動主題含媒體查詢');
  assert.ok(html.includes('matchMedia'), 'Mermaid 依系統偏好');
});

test('highlightTheme 覆寫文件主題的程式碼配色', async () => {
  const dir = await tmpDir();
  const src = '```js\nconst a=1;\n```\n';
  const { html } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
    theme: 'github-light',
    highlightTheme: 'github-dark',
  });
  // 覆寫為 github-dark：固定主題，不應產生淺/深媒體查詢切換
  assert.ok(!html.includes('prefers-color-scheme'), '覆寫後為固定 hljs 主題');
});
