// CLI：解析參數、調度一次性轉檔或 Live Reload 開發伺服器
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';

import { convertFile, DEFAULT_MAX_INLINE_SIZE } from './convert.js';
import { loadConfig, CONFIG_FILENAME, ALLOWED_KEYS } from './config.js';

const require = createRequire(import.meta.url);

const HELP = `
tarmdas — 本地離線 Markdown → 單一 HTML 轉換工具

用法：
  tarmdas <input.md> [選項]

選項：
  -o, --output <file>        輸出 HTML 路徑（預設：同名 .html）
      --css <file>           自訂樣式檔（.css/.scss/.sass/.less），可重複指定
      --external-assets      改用「HTML + 旁置資產夾」模式
      --max-inline-size <n>  inline 模式媒體內嵌上限，支援 k/m/g 後綴（預設 5m）
      --theme <name>         文件主題，共 17 種：github（自動）/ github-light / github-dark /
                             one-light / one-dark / gruvbox-light / gruvbox-dark /
                             tokyo-night-light / tokyo-night-dark / solarized-light /
                             solarized-dark / monokai / dracula / nord /
                             xai（自動）/ xai-light / xai-dark（預設 github）
      --highlight-theme <n>  覆寫程式碼配色（highlight.js 主題；預設跟隨文件主題）
      --max-width <w>        頁面內文最大寬度，純數字視為 px（預設 1600px）
      --font-size <s>        正文基準字級，純數字視為 px（預設 14px）
      --title <text>         文件標題（預設取 front-matter 或首個 H1）
      --breaks               段落內單一換行渲染為 <br>（預設依 Markdown 標準視為空格）
      --no-math              停用 KaTeX
      --no-mermaid           停用 Mermaid
      --no-highlight         停用程式碼高亮
  -w, --watch                啟用 Live Reload 開發伺服器
      --port <n>             開發伺服器埠號（預設 4321）
  -h, --help                 顯示說明
  -v, --version              顯示版本

配置檔：
  自輸入檔所在目錄向上逐層尋找 ${CONFIG_FILENAME}，以其內容作為選項預設值
  （優先序：內建預設 < 配置檔 < CLI 旗標）。可用欄位（對應旗標的 camelCase）：
  ${ALLOWED_KEYS.slice(0, 6).join(', ')},
  ${ALLOWED_KEYS.slice(6).join(', ')}
`.trim();

// 解析 5m / 512k / 1g / 1048576 之類的大小字串為位元組數
function parseSize(value) {
  if (value == null) return DEFAULT_MAX_INLINE_SIZE;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([kmg])?b?$/i);
  if (!m) throw new Error(`無法解析 --max-inline-size 的值：${value}`);
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  const mult = unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1;
  return Math.round(n * mult);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

// 注意：可由配置檔提供的選項不設 parseArgs 預設值，以便區分「旗標未指定」與「明確指定」，未指定時才落入配置檔層
const OPTIONS = {
  output: { type: 'string', short: 'o' },
  css: { type: 'string', multiple: true },
  'external-assets': { type: 'boolean' },
  'max-inline-size': { type: 'string' },
  theme: { type: 'string' },
  'highlight-theme': { type: 'string' },
  'max-width': { type: 'string' },
  'font-size': { type: 'string' },
  title: { type: 'string' },
  breaks: { type: 'boolean' },
  'no-math': { type: 'boolean', default: false },
  'no-mermaid': { type: 'boolean', default: false },
  'no-highlight': { type: 'boolean', default: false },
  watch: { type: 'boolean', short: 'w', default: false },
  port: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
};

export async function run(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    process.stderr.write(`參數錯誤：${err.message}\n\n${HELP}\n`);
    process.exitCode = 1;
    return;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (values.version) {
    const { version } = require('../package.json');
    process.stdout.write(`tarmdas ${version}\n`);
    return;
  }

  const input = positionals[0];
  if (!input) {
    process.stderr.write(`錯誤：缺少輸入檔\n\n${HELP}\n`);
    process.exitCode = 1;
    return;
  }

  // 載入專案配置檔（自輸入檔所在目錄向上尋找），作為選項的預設值層
  let cfg = {};
  try {
    ({ config: cfg } = await loadConfig(path.dirname(path.resolve(input))));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  // 三層合併：內建預設 < 配置檔 < CLI 旗標
  const options = {
    output: values.output,
    css: values.css ?? cfg.css ?? [],
    externalAssets: values['external-assets'] ?? cfg.externalAssets ?? false,
    maxInlineSize: parseSize(values['max-inline-size'] ?? cfg.maxInlineSize),
    theme: values.theme ?? cfg.theme ?? 'github',
    highlightTheme: values['highlight-theme'] ?? cfg.highlightTheme,
    maxWidth: values['max-width'] ?? cfg.maxWidth,
    fontSize: values['font-size'] ?? cfg.fontSize,
    title: values.title,
    breaks: values.breaks ?? cfg.breaks ?? false,
    math: values['no-math'] ? false : (cfg.math ?? true),
    mermaid: values['no-mermaid'] ? false : (cfg.mermaid ?? true),
    highlight: values['no-highlight'] ? false : (cfg.highlight ?? true),
  };

  if (values.watch) {
    const { startWatch } = await import('./watch.js');
    await startWatch(input, {
      ...options,
      port: values.port ? Number(values.port) : cfg.port,
    });
    return; // 伺服器持續執行
  }

  try {
    const { outputPath, title, media } = await convertFile(input, options);
    const rel = path.relative(process.cwd(), outputPath);
    let msg = `已輸出：${rel}（標題：${title}）`;
    if (media.inlined) msg += `，內嵌媒體 ${media.inlined} 個`;
    if (media.copied.length) msg += `，旁置資產 ${media.copied.length} 個`;
    process.stdout.write(`${msg}\n`);
  } catch (err) {
    process.stderr.write(`轉檔失敗：${err.message}\n`);
    process.exitCode = 1;
  }
}

export { parseSize, formatBytes };
