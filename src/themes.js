// 內建文件主題：打包正文 SCSS、highlight.js 程式碼主題與 Mermaid 主題，三者淺/深一致
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { compileStyle } from './styles.js';

const THEMES_DIR = fileURLToPath(new URL('../themes/', import.meta.url));

/**
 * 主題定義：
 *   scss      — themes/ 下的正文樣式檔
 *   highlight — highlight.js 主題：字串為固定主題；物件 { light, dark } 表示依系統自動切換
 *   mermaid   — Mermaid 主題：'auto' 表示初始化時依系統偏好選擇，否則為固定主題名
 */
export const PRESETS = {
  github: {
    scss: 'github.scss',
    highlight: { light: 'github', dark: 'github-dark' },
    mermaid: 'auto',
  },
  'github-light': {
    scss: 'github-light.scss',
    highlight: 'github',
    mermaid: 'default',
  },
  'github-dark': {
    scss: 'github-dark.scss',
    highlight: 'github-dark',
    mermaid: 'dark',
  },
  monokai: {
    scss: 'monokai.scss',
    highlight: 'monokai',
    mermaid: 'dark',
  },
  dracula: {
    scss: 'dracula.scss',
    highlight: 'base16/dracula',
    mermaid: 'dark',
  },
  nord: {
    scss: 'nord.scss',
    highlight: 'nord',
    mermaid: 'dark',
  },
  'one-dark': {
    scss: 'one-dark.scss',
    highlight: 'atom-one-dark',
    mermaid: 'dark',
  },
  'one-light': {
    scss: 'one-light.scss',
    highlight: 'atom-one-light',
    mermaid: 'default',
  },
  'gruvbox-light': {
    scss: 'gruvbox-light.scss',
    highlight: 'base16/gruvbox-light-medium',
    mermaid: 'default',
  },
  'gruvbox-dark': {
    scss: 'gruvbox-dark.scss',
    highlight: 'base16/gruvbox-dark-medium',
    mermaid: 'dark',
  },
  'tokyo-night-light': {
    scss: 'tokyo-night-light.scss',
    highlight: 'tokyo-night-light',
    mermaid: 'default',
  },
  'tokyo-night-dark': {
    scss: 'tokyo-night-dark.scss',
    highlight: 'tokyo-night-dark',
    mermaid: 'dark',
  },
  'solarized-light': {
    scss: 'solarized-light.scss',
    highlight: 'base16/solarized-light',
    mermaid: 'default',
  },
  'solarized-dark': {
    scss: 'solarized-dark.scss',
    highlight: 'base16/solarized-dark',
    mermaid: 'dark',
  },
  xai: {
    scss: 'xai.scss',
    highlight: { light: 'tokyo-night-light', dark: 'tokyo-night-dark' },
    mermaid: 'auto',
  },
  'xai-light': {
    scss: 'xai-light.scss',
    highlight: 'tokyo-night-light',
    mermaid: 'default',
  },
  'xai-dark': {
    scss: 'xai-dark.scss',
    highlight: 'tokyo-night-dark',
    mermaid: 'dark',
  },
};

export const DEFAULT_PRESET = 'github';

export function listPresets() {
  return Object.keys(PRESETS);
}

export function getPreset(name) {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(
      `未知的主題 "${name}"\n\n可用主題：${listPresets().join(', ')}`,
    );
  }
  return preset;
}

/**
 * 編譯指定主題的正文 CSS
 * @param {string} name 主題名稱
 * @returns {Promise<string>}
 */
export async function getPresetCss(name) {
  const preset = getPreset(name);
  return compileStyle(path.join(THEMES_DIR, preset.scss));
}

/**
 * 產生 Mermaid 初始化腳本（auto 主題會在執行期依系統偏好選色）
 * @param {string} mermaidTheme 'auto' 或固定 Mermaid 主題名
 * @param {string} [fontSize]   圖表字級（預設同 themes/_base.scss 的基準字級 14px）
 * @returns {string}
 */
export function mermaidInitScript(mermaidTheme, fontSize = '14px') {
  // 圖表字級與正文基準字體一致，避免圖表文字比正文大
  const themeVariables = `themeVariables: { fontSize: ${JSON.stringify(fontSize)} }`;
  if (mermaidTheme === 'auto') {
    return (
      "mermaid.initialize({ startOnLoad: true, theme: " +
      "(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) " +
      `? 'dark' : 'default', ${themeVariables} });`
    );
  }
  return `mermaid.initialize({ startOnLoad: true, theme: ${JSON.stringify(mermaidTheme)}, ${themeVariables} });`;
}
