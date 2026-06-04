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

test('腳註：[^1] 轉為上標參照與底部腳註區，含回跳連結', () => {
  const { html } = renderMarkdown('正文[^1]。\n\n[^1]: 腳註內容\n');
  assert.ok(html.includes('class="footnote-ref"'), '應有上標參照');
  assert.ok(html.includes('id="fn1"'), '應有腳註項目');
  assert.ok(html.includes('class="footnote-backref"'), '應有回跳連結');
  assert.ok(html.includes('腳註內容'));
  assert.ok(!html.includes('[^1]'), '標記不應殘留');
});

test('錨點：標題產生 slug id 與錨點連結，保留中文', () => {
  const { html } = renderMarkdown('# 安裝指南\n');
  assert.ok(html.includes('<h1 id="安裝指南">'), '標題應有中文 slug id');
  assert.ok(html.includes('class="header-anchor"'), '應插入錨點連結');
  assert.ok(html.includes('href="#安裝指南"'), '錨點應指向自身 id');
});

test('錨點：同名標題以序號去重、標點移除、空白轉連字號', () => {
  const { html } = renderMarkdown('# Hello, World!\n# Hello, World!\n');
  assert.ok(html.includes('id="hello-world"'), '首個應為 hello-world');
  assert.ok(html.includes('id="hello-world-1"'), '重複者應加序號');
});

test('定義清單：詞條與定義轉為 dl/dt/dd', () => {
  const { html } = renderMarkdown('詞條\n: 定義內容\n');
  assert.ok(html.includes('<dl>'));
  assert.ok(html.includes('<dt>詞條</dt>'));
  assert.ok(html.includes('<dd>定義內容</dd>'));
});

test('高亮：==text== 轉為 mark', () => {
  const { html } = renderMarkdown('這是 ==重點== 標示\n');
  assert.ok(html.includes('<mark>重點</mark>'));
});

test('上標／下標：^x^ 與 ~x~ 轉為 sup/sub，且不影響刪除線', () => {
  const { html } = renderMarkdown('x^2^ 與 H~2~O 與 ~~刪除~~\n');
  assert.ok(html.includes('x<sup>2</sup>'), '上標');
  assert.ok(html.includes('H<sub>2</sub>O'), '下標');
  assert.ok(html.includes('<s>刪除</s>'), '刪除線仍正常');
});

test('Emoji：短碼轉為 Unicode 字元', () => {
  const { html } = renderMarkdown('完成 :rocket:\n');
  assert.ok(html.includes('🚀'), ':rocket: 應轉為火箭');
  assert.ok(!html.includes(':rocket:'), '短碼不應殘留');
});

test('縮寫：*[ABBR]: 定義使內文出現 abbr', () => {
  const { html } = renderMarkdown('*[HTML]: HyperText Markup Language\n\nHTML 很實用\n');
  assert.ok(html.includes('<abbr title="HyperText Markup Language">HTML</abbr>'));
});

test('插入：++text++ 轉為 ins', () => {
  const { html } = renderMarkdown('這是 ++新增++ 內容\n');
  assert.ok(html.includes('<ins>新增</ins>'));
});

test('自訂容器：:::name 轉為帶 custom-block 類別的 div，內容仍解析', () => {
  const { html } = renderMarkdown(':::tip 提示\n容器內 **粗體**\n:::\n');
  assert.ok(html.includes('<div class="custom-block custom-block-tip">'));
  assert.ok(html.includes('<strong>粗體</strong>'), '容器內 Markdown 仍應解析');
});

test('TOC：[[toc]] 替換為巢狀目錄，連結對應標題 id', () => {
  const { html } = renderMarkdown('[[toc]]\n\n# 安裝\n## 需求\n# 使用\n');
  assert.ok(html.includes('class="table-of-contents"'), '應產生目錄');
  assert.ok(html.includes('<a href="#安裝">安裝</a>'), '目錄連結應對應標題 id');
  assert.ok(html.includes('<a href="#需求">需求</a>'));
  assert.ok(!html.includes('[[toc]]'), '佔位標記不應殘留');
});

test('TOC：無 [[toc]] 標記時不產生目錄', () => {
  const { html } = renderMarkdown('# 安裝\n內文\n');
  assert.ok(!html.includes('table-of-contents'));
});
