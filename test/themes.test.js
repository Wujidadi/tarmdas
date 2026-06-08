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

test('built-in theme list contains the three github variants and the common palettes', () => {
  const names = listPresets();
  for (const expected of [
    'github', 'github-light', 'github-dark',
    'monokai', 'dracula', 'nord', 'one-dark', 'one-light',
    'gruvbox-light', 'gruvbox-dark', 'tokyo-night-light', 'tokyo-night-dark',
    'solarized-light', 'solarized-dark',
  ]) {
    assert.ok(names.includes(expected), `should include theme ${expected}`);
  }
});

test('every built-in theme: SCSS compiles and the highlight.js theme resolves', async () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const css = await getPresetCss(name);
    assert.ok(/--fg:/.test(css), `${name} should emit the body variables`);
    const hl = typeof preset.highlight === 'object'
      ? [preset.highlight.light, preset.highlight.dark]
      : [preset.highlight];
    for (const theme of hl) {
      const themeCss = await getHighlightCss(theme);
      assert.ok(themeCss.length > 0, `${name}'s hljs theme ${theme} should load`);
    }
  }
});

test('getPreset throws an error listing the available themes for unknown names', () => {
  assert.throws(() => getPreset('nope'), /Available themes: github/);
});

test('github-light compiles light body variables', async () => {
  const css = await getPresetCss('github-light');
  assert.ok(css.includes('--fg: #24292f'), 'should use light text color');
  assert.ok(css.includes('color-scheme: light'));
});

test('github-dark compiles dark body variables', async () => {
  const css = await getPresetCss('github-dark');
  assert.ok(css.includes('--fg: #c9d1d9'), 'should use dark text color');
  assert.ok(css.includes('color-scheme: dark'));
});

test('github (auto) contains both the light default and the dark media query', async () => {
  const css = await getPresetCss('github');
  assert.ok(css.includes('--fg: #24292f'));
  assert.ok(css.includes('prefers-color-scheme: dark'));
  assert.ok(css.includes('--fg: #c9d1d9'));
});

test('mermaidInitScript: auto follows the system preference, fixed themes use the given value', () => {
  assert.match(mermaidInitScript('auto'), /matchMedia[\s\S]*'dark' : 'default'/);
  assert.match(mermaidInitScript('dark'), /theme: "dark"/);
  assert.match(mermaidInitScript('default'), /theme: "default"/);
});

test('mermaidInitScript: diagram font size defaults to the 14px body base and follows the configured size', () => {
  assert.match(mermaidInitScript('auto'), /themeVariables: \{ fontSize: "14px" \}/);
  assert.match(mermaidInitScript('dark'), /themeVariables: \{ fontSize: "14px" \}/);
  assert.match(mermaidInitScript('dark', '15px'), /themeVariables: \{ fontSize: "15px" \}/);
});

test('renderDocument: github-dark links dark body, hljs and Mermaid together', async () => {
  const dir = await tmpDir();
  const src = '# Title\n\n```js\nconst a=1;\n```\n\n```mermaid\ngraph TD\nA-->B\n```\n';
  const { html } = await renderDocument(src, {
    sourceDir: dir,
    outputPath: path.join(dir, 'out.html'),
    theme: 'github-dark',
  });
  assert.ok(html.includes('--fg: #c9d1d9'), 'dark body');
  assert.ok(html.includes('theme: "dark"'), 'dark Mermaid');
  assert.ok(!html.includes('prefers-color-scheme'), 'fixed dark theme should have no media query');
});

test('renderDocument: the default github theme auto-switches', async () => {
  const dir = await tmpDir();
  const src = '```mermaid\ngraph TD\nA-->B\n```\n';
  const { html } = await renderDocument(src, {
    sourceDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.ok(html.includes('prefers-color-scheme: dark'), 'auto theme contains the media query');
  assert.ok(html.includes('matchMedia'), 'Mermaid follows the system preference');
});

test('highlightTheme overrides the document theme code colors', async () => {
  const dir = await tmpDir();
  const src = '```js\nconst a=1;\n```\n';
  const { html } = await renderDocument(src, {
    sourceDir: dir,
    outputPath: path.join(dir, 'out.html'),
    theme: 'github-light',
    highlightTheme: 'github-dark',
  });
  // Overridden to github-dark: a fixed theme, so no light/dark media-query switching
  assert.ok(!html.includes('prefers-color-scheme'), 'override yields a fixed hljs theme');
});
