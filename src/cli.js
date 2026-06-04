// CLI：解析參數、調度一次性轉檔或 Live Reload 開發伺服器
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';

import { convertFile, DEFAULT_MAX_INLINE_SIZE } from './convert.js';

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
      --theme <name>         文件主題，共 14 種：github（自動）/ github-light / github-dark /
                             one-light / one-dark / gruvbox-light / gruvbox-dark /
                             tokyo-night-light / tokyo-night-dark / solarized-light /
                             solarized-dark / monokai / dracula / nord（預設 github）
      --highlight-theme <n>  覆寫程式碼配色（highlight.js 主題；預設跟隨文件主題）
      --title <text>         文件標題（預設取 front-matter 或首個 H1）
      --breaks               段落內單一換行渲染為 <br>（預設依 Markdown 標準視為空格）
      --no-math              停用 KaTeX
      --no-mermaid           停用 Mermaid
      --no-highlight         停用程式碼高亮
  -w, --watch                啟用 Live Reload 開發伺服器
      --port <n>             開發伺服器埠號（預設 4321）
  -h, --help                 顯示說明
  -v, --version              顯示版本
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

const OPTIONS = {
  output: { type: 'string', short: 'o' },
  css: { type: 'string', multiple: true },
  'external-assets': { type: 'boolean', default: false },
  'max-inline-size': { type: 'string' },
  theme: { type: 'string', default: 'github' },
  'highlight-theme': { type: 'string' },
  title: { type: 'string' },
  breaks: { type: 'boolean', default: false },
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

  const options = {
    output: values.output,
    css: values.css ?? [],
    externalAssets: values['external-assets'],
    maxInlineSize: parseSize(values['max-inline-size']),
    theme: values.theme,
    highlightTheme: values['highlight-theme'],
    title: values.title,
    breaks: values.breaks,
    math: !values['no-math'],
    mermaid: !values['no-mermaid'],
    highlight: !values['no-highlight'],
  };

  if (values.watch) {
    const { startWatch } = await import('./watch.js');
    await startWatch(input, {
      ...options,
      port: values.port ? Number(values.port) : undefined,
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
