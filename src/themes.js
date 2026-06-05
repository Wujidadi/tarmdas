// Built-in document themes: each bundles the body SCSS, a highlight.js code theme
// and a Mermaid theme, keeping all three consistent across light/dark
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { compileStyle } from './styles.js';

const THEMES_DIR = fileURLToPath(new URL('../themes/', import.meta.url));

/**
 * Theme definition:
 *   scss      — body stylesheet under themes/
 *   highlight — highlight.js theme: a string means fixed; an object { light, dark }
 *               means auto-switching with the system preference
 *   mermaid   — Mermaid theme: 'auto' picks by system preference at init time,
 *               otherwise a fixed theme name
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
      `Unknown theme "${name}"\n\nAvailable themes: ${listPresets().join(', ')}`,
    );
  }
  return preset;
}

/**
 * Compile the body CSS of the given theme
 * @param {string} name Theme name
 * @returns {Promise<string>}
 */
export async function getPresetCss(name) {
  const preset = getPreset(name);
  return compileStyle(path.join(THEMES_DIR, preset.scss));
}

/**
 * Build the Mermaid initialization script (the auto theme picks colors at runtime
 * based on the system preference)
 * @param {string} mermaidTheme 'auto' or a fixed Mermaid theme name
 * @param {string} [fontSize]   Diagram font size (defaults to the 14px base size of themes/_base.scss)
 * @returns {string}
 */
export function mermaidInitScript(mermaidTheme, fontSize = '14px') {
  // Diagram font size matches the base body font, so diagram text is not larger than prose
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
