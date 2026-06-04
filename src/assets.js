// 資產解析與內嵌：KaTeX CSS（字型 base64）、highlight.js 主題、Mermaid JS、本地圖片/媒體
import { readFile, copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// 解析某個套件的 dist 目錄（透過其 package.json）
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

// ---- 向量資產（樣式表/腳本） ----

/**
 * 取得 KaTeX CSS，並將 @font-face 改寫為只保留 woff2 的 base64 data URI（離線、體積最佳）
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

  // 收集所有需要的 woff2 字型
  const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  let result = css;
  for (const block of blocks) {
    const m = block.match(/url\(fonts\/([^)]+\.woff2)\)/);
    if (!m) continue;
    const uri = await fontDataUri(m[1]);
    // @font-face 內 src 為最後一個屬性，值結束於 '}'（無結尾分號）
    const newBlock = block.replace(/src\s*:[^}]*/, `src:url(${uri}) format("woff2")`);
    result = result.replace(block, newBlock);
  }
  return result;
}

/**
 * 取得 highlight.js 主題 CSS
 * @param {string} [theme='github'] 主題名稱（對應 highlight.js/styles/<theme>.min.css）
 * @returns {Promise<string>}
 */
export async function getHighlightCss(theme = 'github') {
  const dir = pkgDir('highlight.js');
  const file = path.join(dir, 'styles', `${theme}.min.css`);
  try {
    return await readFile(file, 'utf8');
  } catch {
    throw new Error(`找不到 highlight.js 主題 "${theme}"（檔案：${file}）`);
  }
}

/**
 * 取得「自動切換」的 highlight.js CSS：淺色為預設，深色以 prefers-color-scheme 媒體查詢包裹
 * @param {string} [light='github']     淺色主題
 * @param {string} [dark='github-dark'] 深色主題
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
 * 取得 Mermaid 瀏覽器端腳本內容（UMD，暴露全域 mermaid）
 * @returns {Promise<string>}
 */
export async function getMermaidJs() {
  const dir = pkgDir('mermaid');
  return readFile(path.join(dir, 'dist', 'mermaid.min.js'), 'utf8');
}

// ---- 本地圖片/媒體處理 ----

function isRemote(url) {
  return /^(https?:)?\/\//i.test(url) || /^(data:|mailto:|tel:|#)/i.test(url);
}

// 將 SVG 檔內容清理為可內聯的 <svg> 片段（移除 XML 宣告與 DOCTYPE）
function sanitizeSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
}

/**
 * 處理 HTML 片段中的本地圖片/媒體，依模式內嵌（Base64 / SVG 內聯）或複製到旁置資產夾
 * @param {string} html 已渲染的 HTML 片段
 * @param {object} opts
 * @param {string} opts.baseDir           解析相對路徑的基準（Markdown 檔所在目錄）
 * @param {'inline'|'external'} opts.mode 內嵌或外置
 * @param {number} opts.maxInlineSize     inline 模式下超過此位元組數則改為旁置
 * @param {string} opts.assetDir          旁置資產夾的絕對路徑
 * @param {string} opts.assetHref         旁置資產夾的相對 href 前綴（例如 "out.assets"）
 * @returns {Promise<{ html: string, inlined: number, copied: string[] }>}
 */
export async function processMedia(html, opts) {
  const { baseDir, mode, maxInlineSize, assetDir, assetHref } = opts;
  let inlined = 0;
  const copied = [];
  const usedNames = new Map(); // 絕對路徑 -> 旁置後檔名（去重）

  async function resolveLocal(rawUrl) {
    if (!rawUrl || isRemote(rawUrl)) return null;
    // 略過先前已改寫、指向旁置資產夾的 URL，避免重複處理（例如 SVG 在外置模式被二次複製）
    if (rawUrl.startsWith(`${assetHref}/`)) return null;
    const clean = decodeURI(rawUrl.split(/[?#]/)[0]);
    const abs = path.resolve(baseDir, clean);
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
    // 避免不同來源同名衝突
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

  // 將單一來源 URL 轉為內嵌（data URI）或旁置（相對路徑）
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

  // 1) <img src="*.svg"> 在 inline 模式下整段替換為 <svg>
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

  // 2) 其餘媒體：img/video/audio/source 的 src 與 poster
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
