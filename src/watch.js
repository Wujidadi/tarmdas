// Live Reload dev server: node:http serves the output + fs.watch watches sources + SSE pushes reloads
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
 * Start the Live Reload dev server. Keeps running until the process exits
 * @param {string} input     Path to the Markdown file
 * @param {object} [options] Conversion options (as in convertFile), plus port
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
      process.stdout.write(`[tarmdas] Rebuilt ${path.relative(process.cwd(), r.outputPath)}\n`);
      return true;
    } catch (err) {
      process.stderr.write(`[tarmdas] Conversion failed: ${err.message}\n`);
      return false;
    }
  }

  await build();

  // Set of SSE clients
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

    // Map '/' to the output HTML, everything else to files under the output directory (sidecar assets)
    const relPath = url === '/' ? outName : url.replace(/^\/+/, '');
    const filePath = path.join(outDir, relPath);
    // Prevent paths from escaping the output directory
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

  // Watch the sources: the Markdown file and user stylesheets (debounced)
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
      /* the stylesheet may not exist yet, skip it */
    }
  }

  await new Promise((resolve) => server.listen(port, resolve));
  process.stdout.write(
    `[tarmdas] Dev server running: http://localhost:${port}/ (watching ${path.basename(absInput)}, Ctrl+C to stop)\n`,
  );

  const shutdown = () => {
    for (const w of watchers) w.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
