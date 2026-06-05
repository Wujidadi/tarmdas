import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderDocument, convertFile } from '../src/convert.js';

async function tmpDir() {
  return mkdtemp(path.join(tmpdir(), 'tarmdas-'));
}

test('on-demand inlining: plain text carries no KaTeX/Mermaid assets', async () => {
  const dir = await tmpDir();
  const { html, features } = await renderDocument('# Hi\n\nplain', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  // Check directly that no on-demand asset was detected or inlined, rather than
  // inferring indirectly from the total length
  assert.equal(features.math, false, 'math should not be detected');
  assert.equal(features.mermaid, false, 'Mermaid should not be detected');
  assert.equal(features.code, false, 'code highlighting should not be detected');
  assert.ok(!html.includes('data:font/woff2'), 'fonts should not be inlined');
  assert.ok(!html.includes('mermaid.initialize'), 'no Mermaid script expected');
  // The loose upper bound is only a last line of defense against accidentally inlining
  // heavyweight assets: normal base CSS growth never reaches it, but fonts (hundreds
  // of KB) or Mermaid (several MB) would far exceed it and be caught
  assert.ok(html.length < 50_000, `plain-text output should not inline heavyweight assets, got ${html.length}`);
});

test('KaTeX: documents with math get inlined fonts and katex styles', async () => {
  const dir = await tmpDir();
  const { html, features } = await renderDocument('inline $E=mc^2$', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(features.math, true);
  assert.ok(html.includes('class="katex'), 'should contain katex');
  assert.ok(html.includes('data:font/woff2;base64'), 'woff2 fonts should be inlined');
  assert.ok(!html.includes('url(fonts/'), 'no relative font paths should remain');
});

test('Mermaid: fences become pre.mermaid and the script is inlined', async () => {
  const dir = await tmpDir();
  const src = '```mermaid\ngraph TD\nA-->B\n```\n';
  const { html, features } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(features.mermaid, true);
  assert.ok(html.includes('<pre class="mermaid">'), 'should have pre.mermaid');
  assert.ok(html.includes('mermaid.initialize'), 'the init script should be inlined');
});

test('code highlighting: documents with code get the hljs theme inlined', async () => {
  const dir = await tmpDir();
  const { html, features } = await renderDocument('```js\nconst a = 1;\n```\n', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(features.code, true);
  assert.ok(html.includes('class="hljs"'), 'should contain hljs');
});

test('front matter title takes precedence over the H1', async () => {
  const dir = await tmpDir();
  const src = '---\ntitle: Custom Title\n---\n# Document H1\n';
  const { title } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(title, 'Custom Title');
});

test('without front matter, the first H1 becomes the title', async () => {
  const dir = await tmpDir();
  const { title } = await renderDocument('# My Title\nbody', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(title, 'My Title');
});

test('media inlining: PNG becomes Base64, SVG is inlined', async () => {
  const dir = await tmpDir();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await writeFile(path.join(dir, 'dot.png'), png);
  await writeFile(path.join(dir, 'logo.svg'), '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  const src = '![p](dot.png)\n\n![s](logo.svg)\n';
  const { html, media } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.ok(html.includes('data:image/png;base64'), 'PNG should be Base64-inlined');
  assert.ok(html.includes('<svg xmlns'), 'SVG should be inlined');
  assert.ok(!html.includes('<?xml'), 'the SVG XML declaration should be stripped');
  assert.equal(media.inlined, 1, 'only the PNG counts toward the base64 inline count');
});

test('threshold downgrade: media above max-inline-size goes to sidecar assets', async () => {
  const dir = await tmpDir();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await writeFile(path.join(dir, 'dot.png'), png);
  const { html, media } = await renderDocument('![p](dot.png)\n', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
    maxInlineSize: 10,
  });
  assert.ok(!html.includes('data:image/png'), 'above the threshold, no inlining');
  assert.ok(html.includes('out.assets/dot.png'), 'should be rewritten to the sidecar path');
  assert.equal(media.copied.length, 1);
});

test('external-asset mode: always copy to the sidecar folder and write the HTML', async () => {
  const dir = await tmpDir();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await writeFile(path.join(dir, 'dot.png'), png);
  await writeFile(path.join(dir, 'in.md'), '![p](dot.png)\n');
  const { outputPath } = await convertFile(path.join(dir, 'in.md'), {
    output: path.join(dir, 'out.html'),
    externalAssets: true,
  });
  const html = await readFile(outputPath, 'utf8');
  assert.ok(html.includes('out.assets/dot.png'));
  const assets = await readdir(path.join(dir, 'out.assets'));
  assert.deepEqual(assets, ['dot.png']);
});

test('missing output directories are created automatically (including parents)', async () => {
  const dir = await tmpDir();
  await writeFile(path.join(dir, 'in.md'), '# Hi\n');
  const out = path.join(dir, 'deep', 'sub', 'out.html');
  const { outputPath } = await convertFile(path.join(dir, 'in.md'), { output: out });
  const html = await readFile(outputPath, 'utf8');
  assert.ok(html.includes('Hi'), 'should write into the previously missing nested directory');
});

test('external-asset mode: SVG copied only once (already-rewritten sidecar paths are not reprocessed)', async () => {
  const dir = await tmpDir();
  await writeFile(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  await writeFile(path.join(dir, 'in.md'), '![s](logo.svg)\n');
  const { outputPath } = await convertFile(path.join(dir, 'in.md'), {
    output: path.join(dir, 'out.html'),
    externalAssets: true,
  });
  const html = await readFile(outputPath, 'utf8');
  const assets = await readdir(path.join(dir, 'out.assets'));
  assert.deepEqual(assets, ['logo.svg'], 'there should be a single SVG, no logo-1.svg');
  assert.equal((html.match(/out\.assets\/logo\.svg/g) || []).length, 1, 'the HTML should reference it once');
});
