// Core conversion pipeline: Markdown → complete HTML document (with KaTeX, Mermaid, styles, inlined assets)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
 * Convert Markdown source into a complete HTML document string (copying oversized media
 * to the sidecar asset folder when needed)
 * @param {string} source Markdown source
 * @param {object} opts
 * @param {string} opts.baseDir                 Base directory for resolving relative resources
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
 * @returns {Promise<{ html: string, title: string, features: object, media: { inlined: number, copied: string[] } }>}
 */
export async function renderDocument(source, opts) {
  const {
    baseDir,
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
  } = opts;

  const { data: frontMatter, content } = parseFrontMatter(source);

  // 1) Markdown → HTML fragment, reporting which features were actually used
  const { html: rendered, features } = renderMarkdown(content, { math, highlight, breaks });
  const useMath = math && features.math;
  const useMermaid = mermaid && features.mermaid;
  const useCode = highlight && features.code;

  // 2) Process local images/media (inline or sidecar)
  const outBase = path.basename(outputPath, path.extname(outputPath));
  const assetDirName = `${outBase}.assets`;
  const { html: body, inlined, copied } = await processMedia(rendered, {
    baseDir,
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
    baseDir: path.dirname(absInput),
    outputPath,
  });

  // Create the output directory (including parents) when missing, so the write cannot fail
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.html, 'utf8');
  return { outputPath, title: result.title, features: result.features, media: result.media };
}
