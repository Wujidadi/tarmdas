// Live Reload 開發伺服器：node:http 供出產物 + fs.watch 監看來源 + SSE 推送重載
import http from 'node:http';
import { watch as fsWatch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { convertFile } from './convert.js';

const RELOAD_PATH = '/__tarmdas_reload';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function contentType(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * 啟動 Live Reload 開發伺服器。會持續執行直到行程結束
 * @param {string} input     Markdown 檔路徑
 * @param {object} [options] 轉檔選項（同 convertFile），外加 port
 */
export async function startWatch(input, options = {}) {
  const port = options.port ?? 4321;
  const absInput = path.resolve(input);
  const outputPath = path.resolve(
    options.output ?? absInput.replace(/\.(md|markdown)$/i, '') + '.html',
  );
  const outDir = path.dirname(outputPath);
  const outName = path.basename(outputPath);

  const convertOpts = { ...options, output: outputPath, liveReload: true };

  async function build() {
    try {
      const r = await convertFile(absInput, convertOpts);
      process.stdout.write(`[tarmdas] 已重建 ${path.relative(process.cwd(), r.outputPath)}\n`);
      return true;
    } catch (err) {
      process.stderr.write(`[tarmdas] 轉檔失敗：${err.message}\n`);
      return false;
    }
  }

  await build();

  // SSE 客戶端集合
  const clients = new Set();
  function notifyReload() {
    for (const res of clients) res.write('event: reload\ndata: 1\n\n');
  }

  const server = http.createServer(async (req, res) => {
    const url = decodeURI((req.url || '/').split('?')[0]);

    if (url === RELOAD_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(':\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // 將 '/' 對應到產出 HTML，其餘對應到輸出目錄下的檔案（旁置資產）
    const relPath = url === '/' ? outName : url.replace(/^\/+/, '');
    const filePath = path.join(outDir, relPath);
    // 防止路徑跳脫輸出目錄
    if (!filePath.startsWith(outDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const s = await stat(filePath);
      if (!s.isFile()) throw new Error('not a file');
      const buf = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  });

  // 監看來源：Markdown 與使用者樣式檔（去抖）
  let timer = null;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (await build()) notifyReload();
    }, 100);
  };
  const watchers = [fsWatch(absInput, onChange)];
  for (const css of options.css ?? []) {
    try {
      watchers.push(fsWatch(path.resolve(css), onChange));
    } catch {
      /* 樣式檔可能尚不存在，略過 */
    }
  }

  await new Promise((resolve) => server.listen(port, resolve));
  process.stdout.write(
    `[tarmdas] 開發伺服器啟動：http://localhost:${port}/ （監看 ${path.basename(absInput)}，Ctrl+C 結束）\n`,
  );

  const shutdown = () => {
    for (const w of watchers) w.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
