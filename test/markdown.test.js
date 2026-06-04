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

test('breaks：預設依標準將段落內單一換行視為空格', () => {
  const { html } = renderMarkdown('第一行\n第二行\n');
  assert.ok(!html.includes('<br'), '預設不應出現 <br>');
});

test('breaks：啟用後段落內單一換行渲染為 <br>', () => {
  const { html } = renderMarkdown('第一行\n第二行\n', { breaks: true });
  assert.ok(html.includes('<br'), '應出現 <br>');
  assert.ok(html.includes('第一行'));
  assert.ok(html.includes('第二行'));
});

test('GitHub Alerts：未知類型與一般引用不受影響', () => {
  const { html } = renderMarkdown('> [!FOO]\n> 內容\n\n> 一般引用\n');
  assert.ok(!html.includes('markdown-alert'));
  assert.equal((html.match(/<blockquote>/g) || []).length, 2);
});

test('Task List：[ ] 與 [x] 轉為唯讀核取方塊並移除標記', () => {
  const { html } = renderMarkdown('- [ ] 未完成\n- [x] 已完成\n');
  assert.ok(html.includes('class="contains-task-list"'), '清單應加上 contains-task-list');
  assert.equal((html.match(/task-list-item-checkbox/g) || []).length, 2, '應有兩個核取方塊');
  assert.ok(html.includes('checked=""'), '[x] 應為已勾選');
  assert.ok(html.includes('disabled=""'), '核取方塊應為唯讀');
  assert.ok(!html.includes('[ ]') && !html.includes('[x]'), '標記不應殘留');
  assert.ok(html.includes('未完成') && html.includes('已完成'), '內文應保留');
});

test('Task List：大寫 [X] 亦視為已勾選', () => {
  const { html } = renderMarkdown('- [X] 大寫\n');
  assert.ok(html.includes('checked=""'), '[X] 應為已勾選');
});

test('Task List：有序清單不轉換，保留字面標記', () => {
  const { html } = renderMarkdown('1. [ ] 一\n2. [x] 二\n');
  assert.ok(!html.includes('task-list-item-checkbox'), '有序清單不應產生核取方塊');
  assert.ok(html.includes('[ ]') && html.includes('[x]'), '應保留字面標記');
});

test('Task List：一般清單項不受影響', () => {
  const { html } = renderMarkdown('- 一般項目\n- 另一項\n');
  assert.ok(!html.includes('contains-task-list'), '純一般清單不應加類別');
  assert.ok(!html.includes('task-list-item-checkbox'));
});
