// Asset resolution and inlining: KaTeX CSS (base64 fonts), highlight.js themes,
// Mermaid JS, and local image/media handling
import { readFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Resolve a package's dist directory (via its package.json)
function pkgDir(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`));
}

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.woff2': 'font/woff2',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// ---- Vector assets (stylesheets/scripts) ----

/**
 * Get the KaTeX CSS, rewriting @font-face to keep only woff2 as base64 data URIs
 * (offline, best size trade-off)
 * @returns {Promise<string>}
 */
export async function getKatexCss() {
  const dir = pkgDir('katex');
  const css = await readFile(path.join(dir, 'dist', 'katex.min.css'), 'utf8');
  const fontCache = new Map();

  async function fontDataUri(fontFile) {
    if (!fontCache.has(fontFile)) {
      const buf = await readFile(path.join(dir, 'dist', 'fonts', fontFile));
      fontCache.set(fontFile, `data:font/woff2;base64,${buf.toString('base64')}`);
    }
    return fontCache.get(fontFile);
  }

  // Collect every woff2 font that is needed
  const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  let result = css;
  for (const block of blocks) {
    const m = block.match(/url\(fonts\/([^)]+\.woff2)\)/);
    if (!m) continue;
    const uri = await fontDataUri(m[1]);
    // Inside @font-face, src is the last property and its value ends at '}' (no trailing semicolon)
    const newBlock = block.replace(/src\s*:[^}]*/, `src:url(${uri}) format("woff2")`);
    result = result.replace(block, newBlock);
  }
  return result;
}

/**
 * Get a highlight.js theme CSS
 * @param {string} [theme='github'] Theme name (maps to highlight.js/styles/<theme>.min.css)
 * @returns {Promise<string>}
 */
export async function getHighlightCss(theme = 'github') {
  const dir = pkgDir('highlight.js');
  const file = path.join(dir, 'styles', `${theme}.min.css`);
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new Error(`Cannot find highlight.js theme "${theme}" (file: ${file})`);
  }
}

/**
 * Get "auto-switching" highlight.js CSS: light as the default, dark wrapped in a
 * prefers-color-scheme media query
 * @param {string} [light='github']     Light theme
 * @param {string} [dark='github-dark'] Dark theme
 * @returns {Promise<string>}
 */
export async function getHighlightCssAuto(light = 'github', dark = 'github-dark') {
  const [lightCss, darkCss] = await Promise.all([
    getHighlightCss(light),
    getHighlightCss(dark),
  ]);
  return `${lightCss}\n@media (prefers-color-scheme: dark) {\n${darkCss}\n}`;
}

/**
 * Get the Mermaid browser-side script content (UMD, exposing a global `mermaid`)
 * @returns {Promise<string>}
 */
export async function getMermaidJs() {
  const dir = pkgDir('mermaid');
  return readFile(path.join(dir, 'dist', 'mermaid.min.js'), 'utf8');
}

// ---- Local image/media handling ----

function isRemote(url) {
  return /^(https?:)?\/\//i.test(url) || /^(data:|mailto:|tel:|#)/i.test(url);
}

// Sanitize SVG file content into an inlinable <svg> fragment (strip XML declaration and DOCTYPE)
function sanitizeSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
}

/**
 * Process local images/media in an HTML fragment, inlining them (Base64 / inline SVG)
 * or copying them to the sidecar asset folder depending on the mode
 * @param {string} html Rendered HTML fragment
 * @param {object} opts
 * @param {string} opts.sourceDir         Base for resolving relative paths (the Markdown file's directory)
 * @param {'inline'|'external'} opts.mode Inline or external
 * @param {number} opts.maxInlineSize     In inline mode, files above this byte count go sidecar instead
 * @param {string} opts.assetDir          Absolute path of the sidecar asset folder
 * @param {string} opts.assetHref         Relative href prefix of the sidecar asset folder (e.g. "out.assets")
 * @returns {Promise<{ html: string, inlined: number, copied: string[] }>}
 */
export async function processMedia(html, opts) {
  const { sourceDir, mode, maxInlineSize, assetDir, assetHref } = opts;
  let inlined = 0;
  const copied = [];
  const usedNames = new Map(); // absolute path -> sidecar file name (deduplicated)

  async function resolveLocal(rawUrl) {
    if (!rawUrl || isRemote(rawUrl)) return null;
    // Skip URLs already rewritten to point into the sidecar asset folder, to avoid
    // double processing (e.g. an SVG copied twice in external mode)
    if (rawUrl.startsWith(`${assetHref}/`)) return null;
    // `~`-rooted targets have already been expanded to absolute file:// URLs upstream
    // (see homepaths.js); decode those back to a real path so they can be inlined/copied
    let abs;
    if (/^file:\/\//i.test(rawUrl)) {
      try {
        abs = fileURLToPath(rawUrl.split('#')[0]);
      } catch {
        return null;
      }
    } else {
      const clean = decodeURI(rawUrl.split(/[?#]/)[0]);
      abs = path.resolve(sourceDir, clean);
    }
    try {
      const s = await stat(abs);
      if (!s.isFile()) return null;
      return { abs, size: s.size };
    } catch {
      return null;
    }
  }

  async function copyToSidecar(abs) {
    if (usedNames.has(abs)) return usedNames.get(abs);
    await mkdir(assetDir, { recursive: true });
    let name = path.basename(abs);
    // Avoid name collisions between different sources
    let candidate = name;
    let i = 1;
    const taken = new Set(usedNames.values());
    while (taken.has(candidate)) {
      const ext = path.extname(name);
      candidate = `${path.basename(name, ext)}-${i}${ext}`;
      i += 1;
    }
    await copyFile(abs, path.join(assetDir, candidate));
    usedNames.set(abs, candidate);
    copied.push(candidate);
    return candidate;
  }

  // Turn a single source URL into an inline data URI or a sidecar relative path
  async function transform(rawUrl, { allowSvgInline = false } = {}) {
    const local = await resolveLocal(rawUrl);
    if (!local) return null;

    const ext = path.extname(local.abs).toLowerCase();
    const wantInline = mode === 'inline' && local.size <= maxInlineSize;

    if (wantInline) {
      if (ext === '.svg' && allowSvgInline) {
        return { svg: sanitizeSvg(await readFile(local.abs, 'utf8')) };
      }
      const buf = await readFile(local.abs);
      inlined += 1;
      return { url: `data:${mimeFor(local.abs)};base64,${buf.toString('base64')}` };
    }

    const name = await copyToSidecar(local.abs);
    return { url: `${assetHref}/${name}` };
  }

  // 1) In inline mode, <img src="*.svg"> is replaced wholesale with <svg>
  const imgSvg = /<img\b[^>]*?\bsrc\s*=\s*(["'])([^"']+\.svg)\1[^>]*>/gi;
  const svgTasks = [];
  html.replace(imgSvg, (match, _q, url) => {
    svgTasks.push({ match, url });
    return match;
  });
  for (const { match, url } of svgTasks) {
    const r = await transform(url, { allowSvgInline: true });
    if (r?.svg) {
      html = html.replace(match, r.svg);
    } else if (r?.url) {
      html = html.replace(match, match.replace(url, r.url));
    }
  }

  // 2) Remaining media: src and poster on img/video/audio/source
  const attrRe = /\b(src|poster)\s*=\s*(["'])([^"']+)\2/gi;
  const attrTasks = [];
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    attrTasks.push({ full: m[0], attr: m[1], quote: m[2], url: m[3] });
  }
  for (const t of attrTasks) {
    const r = await transform(t.url);
    if (r?.url) {
      const replacement = `${t.attr}=${t.quote}${r.url}${t.quote}`;
      html = html.replace(t.full, replacement);
    }
  }

  return { html, inlined, copied };
}
