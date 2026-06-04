import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderDocument, convertFile } from '../src/convert.js';

async function tmpDir() {
  return mkdtemp(path.join(tmpdir(), 'tarmdas-'));
}

test('按需內嵌：純文字不含 KaTeX/Mermaid 資產', async () => {
  const dir = await tmpDir();
  const { html, features } = await renderDocument('# Hi\n\nplain', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  // 直接檢查「未偵測到、也未內嵌任何按需資產」，而非以總長度間接推估
  assert.equal(features.math, false, '不應偵測到數學');
  assert.equal(features.mermaid, false, '不應偵測到 Mermaid');
  assert.equal(features.code, false, '不應偵測到程式碼高亮');
  assert.ok(!html.includes('data:font/woff2'), '不應內嵌字型');
  assert.ok(!html.includes('mermaid.initialize'), '不應含 Mermaid 腳本');
  // 寬鬆上限僅作為「誤嵌重量級資產」的最後防線：基底 CSS 正常成長不會觸及，
  // 但字型（數百 KB）、Mermaid（數 MB）等大型內嵌都會遠超此值而被攔下
  assert.ok(html.length < 50_000, `純文字輸出不應內嵌重量級資產，實際 ${html.length}`);
});

test('KaTeX：含數學時內嵌字型與 katex 樣式', async () => {
  const dir = await tmpDir();
  const { html, features } = await renderDocument('行內 $E=mc^2$', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(features.math, true);
  assert.ok(html.includes('class="katex'), '應含 katex');
  assert.ok(html.includes('data:font/woff2;base64'), '應內嵌 woff2 字型');
  assert.ok(!html.includes('url(fonts/'), '不應殘留字型相對路徑');
});

test('Mermaid：fence 轉為 pre.mermaid 並內嵌腳本', async () => {
  const dir = await tmpDir();
  const src = '```mermaid\ngraph TD\nA-->B\n```\n';
  const { html, features } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(features.mermaid, true);
  assert.ok(html.includes('<pre class="mermaid">'), '應有 pre.mermaid');
  assert.ok(html.includes('mermaid.initialize'), '應內嵌初始化腳本');
});

test('程式碼高亮：含程式碼時內嵌 hljs 主題', async () => {
  const dir = await tmpDir();
  const { html, features } = await renderDocument('```js\nconst a = 1;\n```\n', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(features.code, true);
  assert.ok(html.includes('class="hljs"'), '應有 hljs');
});

test('front-matter title 優先於 H1', async () => {
  const dir = await tmpDir();
  const src = '---\ntitle: 自訂標題\n---\n# 文件 H1\n';
  const { title } = await renderDocument(src, {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(title, '自訂標題');
});

test('無 front-matter 時取首個 H1 為標題', async () => {
  const dir = await tmpDir();
  const { title } = await renderDocument('# 我的標題\n內文', {
    baseDir: dir,
    outputPath: path.join(dir, 'out.html'),
  });
  assert.equal(title, '我的標題');
});

test('媒體內嵌：PNG 轉 Base64、SVG 內聯', async () => {
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
  assert.ok(html.includes('data:image/png;base64'), 'PNG 應 Base64 內嵌');
  assert.ok(html.includes('<svg xmlns'), 'SVG 應內聯');
  assert.ok(!html.includes('<?xml'), 'SVG 的 XML 宣告應被清理');
  assert.equal(media.inlined, 1, '僅 PNG 計入 base64 內嵌數');
});

test('門檻降級：超過 max-inline-size 改為旁置資產', async () => {
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
  assert.ok(!html.includes('data:image/png'), '超門檻不應內嵌');
  assert.ok(html.includes('out.assets/dot.png'), '應改寫為旁置路徑');
  assert.equal(media.copied.length, 1);
});

test('外置資產模式：一律複製到旁置夾並寫出 HTML', async () => {
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

test('輸出目錄不存在時自動建立（含多層）', async () => {
  const dir = await tmpDir();
  await writeFile(path.join(dir, 'in.md'), '# Hi\n');
  const out = path.join(dir, 'deep', 'sub', 'out.html');
  const { outputPath } = await convertFile(path.join(dir, 'in.md'), { output: out });
  const html = await readFile(outputPath, 'utf8');
  assert.ok(html.includes('Hi'), '應成功寫出至原本不存在的多層目錄');
});

test('外置資產模式：SVG 只複製一次（不重複處理已改寫的旁置路徑）', async () => {
  const dir = await tmpDir();
  await writeFile(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  await writeFile(path.join(dir, 'in.md'), '![s](logo.svg)\n');
  const { outputPath } = await convertFile(path.join(dir, 'in.md'), {
    output: path.join(dir, 'out.html'),
    externalAssets: true,
  });
  const html = await readFile(outputPath, 'utf8');
  const assets = await readdir(path.join(dir, 'out.assets'));
  assert.deepEqual(assets, ['logo.svg'], '應只有一份 SVG，無 logo-1.svg');
  assert.equal((html.match(/out\.assets\/logo\.svg/g) || []).length, 1, 'HTML 應只引用一次');
});
