import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../src/markdown.js';

test('GitHub Alerts：[!NOTE] 轉為警示區塊並移除標記', () => {
  const { html } = renderMarkdown('> [!NOTE]\n> 注意事項內容\n');
  assert.ok(html.includes('class="markdown-alert markdown-alert-note"'), '應有 markdown-alert-note');
  assert.ok(html.includes('class="markdown-alert-title"'), '應有標題列');
  assert.ok(html.includes('>Note</p>'), '標題應為 Note');
  assert.ok(html.includes('注意事項內容'), '內文應保留');
  assert.ok(!html.includes('[!NOTE]'), '標記不應殘留');
  assert.ok(!html.includes('<blockquote>'), '不應再渲染為 blockquote');
});

test('GitHub Alerts：五種類型皆支援且大小寫不拘', () => {
  for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
    const { html } = renderMarkdown(`> [!${type}]\n> 內容\n`);
    assert.ok(
      html.includes(`markdown-alert-${type.toLowerCase()}`),
      `${type} 應轉為警示區塊`,
    );
  }
  const { html } = renderMarkdown('> [!important]\n> 內容\n');
  assert.ok(html.includes('markdown-alert-important'), '小寫標記亦應支援');
});

test('GitHub Alerts：標記與內文以空行分段時亦可辨識', () => {
  const { html } = renderMarkdown('> [!WARNING]\n>\n> 第二段內容\n');
  assert.ok(html.includes('markdown-alert-warning'));
  assert.ok(html.includes('第二段內容'));
  assert.ok(!html.includes('[!WARNING]'));
});

test('GitHub Alerts：標記同行有其他文字時維持一般引用', () => {
  const { html } = renderMarkdown('> [!NOTE] 同行文字\n');
  assert.ok(html.includes('<blockquote>'), '應維持 blockquote');
  assert.ok(!html.includes('markdown-alert'), '不應轉為警示區塊');
});

test('GitHub Alerts：未知類型與一般引用不受影響', () => {
  const { html } = renderMarkdown('> [!FOO]\n> 內容\n\n> 一般引用\n');
  assert.ok(!html.includes('markdown-alert'));
  assert.equal((html.match(/<blockquote>/g) || []).length, 2);
});
