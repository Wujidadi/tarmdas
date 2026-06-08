// Core conversion pipeline: Markdown → complete HTML document (with KaTeX, Mermaid, styles, inlined assets)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { renderMarkdown } from './markdown.js';
import { compileStyles } from './styles.js';
import { buildHtml } from './template.js';
import {
  getKatexCss,
  getHighlightCss,
  getHighlightCssAuto,
  getMermaidJs,
  processMedia,
} from './assets.js';
import { getPreset, getPresetCss, mermaidInitScript, DEFAULT_PRESET } from './themes.js';

export const DEFAULT_MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5 MB

// Parse (minimal) front matter: only key: value pairs inside a leading --- block
function parseFrontMatter(source) {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, content: source };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, content: source.slice(m[0].length) };
}

/**
 * Parse a size string like 5m / 512k / 1g / 1048576 into a byte count
 * @param {string|number} [value] Size string (k/m/g suffix, optional trailing b); null/undefined yields the default
 * @returns {number}
 */
export function parseSize(value) {
  if (value == null) return DEFAULT_MAX_INLINE_SIZE;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([kmg])?b?$/i);
  if (!m) throw new Error(`Cannot parse max-inline-size value: ${value}`);
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  const mult = unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1;
  return Math.round(n * mult);
}

// Options a document's own YAML front matter may set, overriding every other layer (built-in defaults < config file < CLI flags < front matter).
// Keys are the camelCase config names; kebab-case flag forms (e.g. `max-width`) are accepted and normalized to them.
// This mirrors config.js ALLOWED_KEYS minus the server/per-run-only port and output
const FRONT_MATTER_OPTIONS = {
  theme: 'string',
  highlightTheme: 'string',
  maxWidth: 'string',
  fontSize: 'string',
  externalAssets: 'boolean',
  maxInlineSize: 'size',
  breaks: 'boolean',
  math: 'boolean',
  mermaid: 'boolean',
  highlight: 'boolean',
  newTab: 'boolean',
  css: 'paths',
  baseDir: 'dir',
};

// Coerce a front-matter boolean (values arrive as strings); return undefined when
// unrecognized, so the key is left untouched rather than forced to false
function frontMatterBool(value) {
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === 'on' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === 'off' || s === '0') return false;
  return undefined;
}

/**
 * Build the front-matter option-override layer: recognize tarmdas option keys (camelCase
 * or kebab-case), coerce their string values to the right types, and ignore everything
 * else so unrelated metadata (author, date, tags...) is left alone
 * @param {object} frontMatter Raw key/value pairs parsed from the leading --- block
 * @param {string} sourceDir   Directory of the Markdown file (for resolving css/baseDir paths)
 * @returns {object} Options to layer on top of the already-resolved opts
 */
function frontMatterOptions(frontMatter, sourceDir) {
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(frontMatter)) {
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const type = FRONT_MATTER_OPTIONS[key];
    if (!type) continue;
    if (type === 'boolean') {
      const b = frontMatterBool(rawValue);
      if (b !== undefined) out[key] = b;
    } else if (type === 'size') {
      out[key] = parseSize(rawValue);
    } else if (type === 'paths') {
      // A single path or a comma-separated list, each resolved against the Markdown file's directory
      out[key] = String(rawValue)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => path.resolve(sourceDir, p));
    } else if (type === 'dir') {
      let b = String(rawValue).trim();
      if (b === '~' || b.startsWith('~/')) b = path.join(os.homedir(), b.slice(1));
      out[key] = path.resolve(sourceDir, b);
    } else {
      out[key] = String(rawValue);
    }
  }
  return out;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

// Normalize a CSS length: bare numbers become px, anything else (any CSS length unit) passes through
export function cssLength(value) {
  const s = String(value).trim();
  return /^\d+(\.\d+)?$/.test(s) ? `${s}px` : s;
}

function resolveTitle({ explicit, frontMatter, bodyHtml, fallback }) {
  if (explicit) return explicit;
  if (frontMatter.title) return frontMatter.title;
  const h1 = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  // Strip the heading anchor link first (including its # text) so it does not leak into the title
  if (h1) return stripTags(h1[1].replace(/<a class="header-anchor"[\s\S]*?<\/a>/i, ''));
  return fallback;
}

/**
 * Convert Markdown source into a complete HTML document string (copying oversized media to the sidecar asset folder when needed).
 * The document's own front matter is the highest-precedence layer: its recognized option keys override the matching opts below
 * @param {string} source Markdown source
 * @param {object} opts
 * @param {string} opts.sourceDir               Directory of the Markdown source file, for resolving relative resources
 * @param {string} opts.outputPath              Target path of the output HTML (determines sidecar asset folder location/name)
 * @param {string[]} [opts.css=[]]              User-supplied stylesheets
 * @param {boolean} [opts.externalAssets=false] Use external-asset mode instead
 * @param {number} [opts.maxInlineSize]         Media inline-embedding limit in inline mode (bytes)
 * @param {string} [opts.theme='github']        Document theme (github / github-light / github-dark)
 * @param {string} [opts.highlightTheme]        Override the highlight.js code theme (defaults to following the document theme)
 * @param {string|number} [opts.maxWidth]       Max page content width (bare number means px; default 1600px)
 * @param {string|number} [opts.fontSize]       Base body font size (bare number means px; default 14px)
 * @param {string} [opts.title]                 Override the document title
 * @param {boolean} [opts.math=true]            Enable KaTeX
 * @param {boolean} [opts.mermaid=true]         Enable Mermaid
 * @param {boolean} [opts.highlight=true]       Enable code highlighting
 * @param {boolean} [opts.breaks=false]         Render single newlines inside paragraphs as <br>
 * @param {boolean} [opts.liveReload=false]     Inject the Live Reload script
 * @param {string}  [opts.homedir]              Home directory for expanding `~` link/image targets (default os.homedir())
 * @param {string}  [opts.baseDir]              Absolute base directory for expanding `@/` link/image targets (no expansion when unset)
 * @param {boolean} [opts.newTab=true]          Open links to other documents in a new tab (target="_blank")
 * @returns {Promise<{ html: string, title: string, features: object, media: { inlined: number, copied: string[] } }>}
 */
export async function renderDocument(source, opts) {
  const { data: frontMatter, content } = parseFrontMatter(source);

  // The document's own front matter is the highest-precedence layer:
  // its recognized option keys override the built-in defaults, the config file and the CLI flags carried in opts
  const merged = { ...opts, ...frontMatterOptions(frontMatter, opts.sourceDir) };

  const {
    sourceDir,
    outputPath,
    css = [],
    externalAssets = false,
    maxInlineSize = DEFAULT_MAX_INLINE_SIZE,
    theme = DEFAULT_PRESET,
    highlightTheme,
    maxWidth,
    fontSize,
    title: explicitTitle,
    math = true,
    mermaid = true,
    highlight = true,
    breaks = false,
    liveReload = false,
    homedir,
    baseDir,
    newTab = true,
  } = merged;

  // 1) Markdown → HTML fragment, reporting which features were actually used
  const { html: rendered, features } = renderMarkdown(content, { math, highlight, breaks, homedir, baseDir, newTab });
  const useMath = math && features.math;
  const useMermaid = mermaid && features.mermaid;
  const useCode = highlight && features.code;

  // 2) Process local images/media (inline or sidecar)
  const outBase = path.basename(outputPath, path.extname(outputPath));
  const assetDirName = `${outBase}.assets`;
  const { html: body, inlined, copied } = await processMedia(rendered, {
    sourceDir,
    mode: externalAssets ? 'external' : 'inline',
    maxInlineSize,
    assetDir: path.join(path.dirname(outputPath), assetDirName),
    assetHref: assetDirName,
  });

  // 3) Collect styles and scripts to inline (on demand)
  const preset = getPreset(theme); // validate the theme and obtain its linked settings
  const styles = [];
  styles.push(await getPresetCss(theme)); // body theme (light/dark)
  // Layout overrides: :root variables override the _base.scss defaults, and can still
  // be overridden by user styles appended later
  const layout = [];
  if (maxWidth != null) layout.push(`--page-max-width: ${cssLength(maxWidth)};`);
  if (fontSize != null) layout.push(`--base-font-size: ${cssLength(fontSize)};`);
  if (layout.length) styles.push(`:root {\n  ${layout.join('\n  ')}\n}`);
  if (useCode) {
    // Code theme: user override > the theme's fixed/auto setting
    if (highlightTheme) {
      styles.push(await getHighlightCss(highlightTheme));
    } else if (typeof preset.highlight === 'object') {
      styles.push(await getHighlightCssAuto(preset.highlight.light, preset.highlight.dark));
    } else {
      styles.push(await getHighlightCss(preset.highlight));
    }
  }
  if (useMath) styles.push(await getKatexCss());
  const userCss = await compileStyles(css);
  if (userCss) styles.push(userCss);

  const scripts = [];
  if (useMermaid) {
    scripts.push(await getMermaidJs());
    // Diagram font size follows the base body font size (when unconfigured,
    // mermaidInitScript falls back to its 14px default)
    scripts.push(mermaidInitScript(preset.mermaid, fontSize != null ? cssLength(fontSize) : undefined));
  }

  // 4) Assemble the complete document
  const title = resolveTitle({
    explicit: explicitTitle,
    frontMatter,
    bodyHtml: body,
    fallback: outBase,
  });

  const html = buildHtml({ title, body, styles, scripts, liveReload });

  return { html, title, features: { math: useMath, mermaid: useMermaid, code: useCode }, media: { inlined, copied } };
}

/**
 * Read a Markdown file, convert it and write the HTML file
 * @param {string} inputPath Path to the Markdown file
 * @param {object} [opts]    Remaining options as in renderDocument (output sets the output path)
 * @returns {Promise<{ outputPath: string, title: string, features: object, media: object }>}
 */
export async function convertFile(inputPath, opts = {}) {
  const absInput = path.resolve(inputPath);
  const outputPath = path.resolve(
    opts.output ?? absInput.replace(/\.(md|markdown)$/i, '') + '.html',
  );
  const source = await readFile(absInput, 'utf8');

  const result = await renderDocument(source, {
    ...opts,
    sourceDir: path.dirname(absInput),
    outputPath,
  });

  // Create the output directory (including parents) when missing, so the write cannot fail
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.html, 'utf8');
  return { outputPath, title: result.title, features: result.features, media: result.media };
}
