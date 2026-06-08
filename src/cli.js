// CLI: parse arguments, then dispatch a one-shot conversion or the Live Reload dev server
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';

import { convertFile, parseSize } from './convert.js';
import { loadConfig, CONFIG_FILENAME, ALLOWED_KEYS } from './config.js';

const require = createRequire(import.meta.url);

const HELP = `
tarmdas — local, fully offline Markdown → single HTML converter

Usage:
  tarmdas <input.md> [options]

Options:
  -o, --output <file>        Output HTML path (default: same name with .html)
      --css <file>           Custom stylesheet (.css/.scss/.sass/.less), repeatable
      --external-assets      Use "HTML + sidecar asset folder" mode instead
      --max-inline-size <n>  Media inline-embedding limit in inline mode, supports
                             k/m/g suffixes (default 5m)
      --theme <name>         Document theme, 17 in total: github (auto) / github-light /
                             github-dark / one-light / one-dark / gruvbox-light /
                             gruvbox-dark / tokyo-night-light / tokyo-night-dark /
                             solarized-light / solarized-dark / monokai / dracula /
                             nord / xai (auto) / xai-light / xai-dark (default github)
      --highlight-theme <n>  Override code colors (highlight.js theme; defaults to
                             following the document theme)
      --max-width <w>        Max page content width, bare number means px (default 1600px)
      --font-size <s>        Base body font size, bare number means px (default 14px)
      --title <text>         Document title (default: front matter or first H1)
      --breaks               Render single newlines inside paragraphs as <br>
                             (default: treated as spaces per the Markdown spec)
      --no-new-tab           Keep links to other documents in the same tab
                             (default: they open in a new tab with
                             target="_blank" rel="noopener noreferrer")
      --no-math              Disable KaTeX
      --no-mermaid           Disable Mermaid
      --no-highlight         Disable code highlighting
  -w, --watch                Start the Live Reload dev server
      --port <n>             Dev server port (default 4321)
  -h, --help                 Show this help
  -v, --version              Show version

Config file:
  Searches upward from the input file's directory for ${CONFIG_FILENAME} and uses
  its contents as option defaults (precedence: built-in defaults < config file <
  CLI flags). Available fields (camelCase forms of the flags):
  ${ALLOWED_KEYS.slice(0, 6).join(', ')},
  ${ALLOWED_KEYS.slice(6).join(', ')}

Front matter:
  A document's own YAML front matter (the leading --- block) may set the same
  options, taking precedence over everything above (defaults < config < flags <
  front matter), e.g. a line "max-width: 1670px". Keys accept either the camelCase
  config names or the kebab-case flag names; booleans take true/false; unrelated
  metadata (title, author, date...) is ignored. port and output are not accepted.

Local file links:
  In links and images, a leading ~ expands to your home directory and a leading
  @/ expands to the config file's "baseDir", both becoming absolute file:// URLs
  (e.g. [draft](~/notes/draft.md) or [draft](@/notes/draft.md)). The @/ prefix
  only works when baseDir is set in ${CONFIG_FILENAME}.
`.trim();

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

// Note: options that can come from the config file get no parseArgs default,
// so that "flag not given" is distinguishable from "explicitly given"
// and only falls back to the config-file layer when unspecified
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
  'no-new-tab': { type: 'boolean', default: false },
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
    process.stderr.write(`Argument error: ${err.message}\n\n${HELP}\n`);
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
    process.stderr.write(`Error: missing input file\n\n${HELP}\n`);
    process.exitCode = 1;
    return;
  }

  // Load the project config file (searching upward from the input file's directory) as the default-value layer for options
  let cfg = {};
  try {
    ({ config: cfg } = await loadConfig(path.dirname(path.resolve(input))));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  // Three-layer merge: built-in defaults < config file < CLI flags
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
    newTab: values['no-new-tab'] ? false : (cfg.newTab ?? true),
    math: values['no-math'] ? false : (cfg.math ?? true),
    mermaid: values['no-mermaid'] ? false : (cfg.mermaid ?? true),
    highlight: values['no-highlight'] ? false : (cfg.highlight ?? true),
    baseDir: cfg.baseDir, // backs the `@/` link/image prefix
  };

  if (values.watch) {
    const { startWatch } = await import('./watch.js');
    await startWatch(input, {
      ...options,
      port: values.port ? Number(values.port) : cfg.port,
    });
    return; // the server keeps running
  }

  try {
    const { outputPath, title, media } = await convertFile(input, options);
    const rel = path.relative(process.cwd(), outputPath);
    let msg = `Written: ${rel} (title: ${title})`;
    if (media.inlined) msg += `, ${media.inlined} media inlined`;
    if (media.copied.length) msg += `, ${media.copied.length} sidecar asset(s)`;
    process.stdout.write(`${msg}\n`);
  } catch (err) {
    process.stderr.write(`Conversion failed: ${err.message}\n`);
    process.exitCode = 1;
  }
}

export { parseSize, formatBytes };
