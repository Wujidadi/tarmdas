// 核心轉檔管線：Markdown → 完整 HTML 文件（含 KaTeX、Mermaid、樣式、資產內嵌）
import { readFile, writeFile } from 'node:fs/promises';
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

// 解析（極簡）front-matter：僅支援頂部 --- 區塊內的 key: value
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

function resolveTitle({ explicit, frontMatter, bodyHtml, fallback }) {
  if (explicit) return explicit;
  if (frontMatter.title) return frontMatter.title;
  const h1 = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);
  return fallback;
}

/**
 * 將 Markdown 原始碼轉為完整 HTML 文件字串（並依需要把超大媒體複製到旁置資產夾）
 * @param {string} source Markdown 原始碼
 * @param {object} opts
 * @param {string} opts.baseDir                 解析相對資源的基準目錄
 * @param {string} opts.outputPath              輸出 HTML 的目標路徑（用於決定旁置資產夾位置/命名）
 * @param {string[]} [opts.css=[]]              使用者自訂樣式檔
 * @param {boolean} [opts.externalAssets=false] 改用外置資產模式
 * @param {number} [opts.maxInlineSize]         inline 模式媒體內嵌上限（位元組）
 * @param {string} [opts.theme='github']        文件主題（github / github-light / github-dark）
 * @param {string} [opts.highlightTheme]        覆寫 highlight.js 程式碼主題（預設跟隨文件主題）
 * @param {string} [opts.title]                 覆寫文件標題
 * @param {boolean} [opts.math=true]            啟用 KaTeX
 * @param {boolean} [opts.mermaid=true]         啟用 Mermaid
 * @param {boolean} [opts.highlight=true]       啟用程式碼高亮
 * @param {boolean} [opts.breaks=false]         段落內單一換行渲染為 <br>
 * @param {boolean} [opts.liveReload=false]     注入 Live Reload 腳本
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
    title: explicitTitle,
    math = true,
    mermaid = true,
    highlight = true,
    breaks = false,
    liveReload = false,
  } = opts;

  const { data: frontMatter, content } = parseFrontMatter(source);

  // 1) Markdown → HTML 片段，並回報實際用到的功能
  const { html: rendered, features } = renderMarkdown(content, { math, highlight, breaks });
  const useMath = math && features.math;
  const useMermaid = mermaid && features.mermaid;
  const useCode = highlight && features.code;

  // 2) 處理本地圖片/媒體（內嵌或旁置）
  const outBase = path.basename(outputPath, path.extname(outputPath));
  const assetDirName = `${outBase}.assets`;
  const { html: body, inlined, copied } = await processMedia(rendered, {
    baseDir,
    mode: externalAssets ? 'external' : 'inline',
    maxInlineSize,
    assetDir: path.join(path.dirname(outputPath), assetDirName),
    assetHref: assetDirName,
  });

  // 3) 蒐集要內嵌的樣式與腳本（按需）
  const preset = getPreset(theme); // 驗證主題並取得連動設定
  const styles = [];
  styles.push(await getPresetCss(theme)); // 正文主題（淺/深）
  if (useCode) {
    // 程式碼主題：使用者覆寫 > 主題的固定/自動設定
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
    scripts.push(mermaidInitScript(preset.mermaid));
  }

  // 4) 組裝完整文件
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
 * 讀取 Markdown 檔、轉檔並寫出 HTML 檔
 * @param {string} inputPath Markdown 檔路徑
 * @param {object} [opts]    其餘選項同 renderDocument（output 指定輸出路徑）
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

  await writeFile(outputPath, result.html, 'utf8');
  return { outputPath, title: result.title, features: result.features, media: result.media };
}
