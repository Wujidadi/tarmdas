import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../src/markdown.js';

test('GitHub Alerts: [!NOTE] becomes an alert block and the marker is removed', () => {
  const { html } = renderMarkdown('> [!NOTE]\n> Note body text\n');
  assert.ok(html.includes('class="markdown-alert markdown-alert-note"'), 'should have markdown-alert-note');
  assert.ok(html.includes('class="markdown-alert-title"'), 'should have a title row');
  assert.ok(html.includes('>Note</p>'), 'title should be Note');
  assert.ok(html.includes('Note body text'), 'body should be preserved');
  assert.ok(!html.includes('[!NOTE]'), 'marker should not remain');
  assert.ok(!html.includes('<blockquote>'), 'should no longer render as a blockquote');
});

test('GitHub Alerts: all six types are supported, case-insensitively', () => {
  for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION', 'DATE']) {
    const { html } = renderMarkdown(`> [!${type}]\n> body\n`);
    assert.ok(
      html.includes(`markdown-alert-${type.toLowerCase()}`),
      `${type} should become an alert block`,
    );
  }
  const { html } = renderMarkdown('> [!important]\n> body\n');
  assert.ok(html.includes('markdown-alert-important'), 'lowercase markers should also work');
});

test('GitHub Alerts: marker separated from body by a blank line is also recognized', () => {
  const { html } = renderMarkdown('> [!WARNING]\n>\n> Second paragraph\n');
  assert.ok(html.includes('markdown-alert-warning'));
  assert.ok(html.includes('Second paragraph'));
  assert.ok(!html.includes('[!WARNING]'));
});

test('GitHub Alerts: marker with other text on the same line stays a regular quote', () => {
  const { html } = renderMarkdown('> [!NOTE] same-line text\n');
  assert.ok(html.includes('<blockquote>'), 'should remain a blockquote');
  assert.ok(!html.includes('markdown-alert'), 'should not become an alert block');
});

test('breaks: by default single newlines inside paragraphs are spaces, per the spec', () => {
  const { html } = renderMarkdown('first line\nsecond line\n');
  assert.ok(!html.includes('<br'), 'no <br> expected by default');
});

test('breaks: when enabled, single newlines inside paragraphs render as <br>', () => {
  const { html } = renderMarkdown('first line\nsecond line\n', { breaks: true });
  assert.ok(html.includes('<br'), '<br> expected');
  assert.ok(html.includes('first line'));
  assert.ok(html.includes('second line'));
});

test('GitHub Alerts: unknown types and regular quotes are unaffected', () => {
  const { html } = renderMarkdown('> [!FOO]\n> body\n\n> regular quote\n');
  assert.ok(!html.includes('markdown-alert'));
  assert.equal((html.match(/<blockquote>/g) || []).length, 2);
});

test('Task list: [ ] and [x] become read-only checkboxes and markers are removed', () => {
  const { html } = renderMarkdown('- [ ] pending\n- [x] done\n');
  assert.ok(html.includes('class="contains-task-list"'), 'list should get contains-task-list');
  assert.equal((html.match(/task-list-item-checkbox/g) || []).length, 2, 'two checkboxes expected');
  assert.ok(html.includes('checked=""'), '[x] should be checked');
  assert.ok(html.includes('disabled=""'), 'checkboxes should be read-only');
  assert.ok(!html.includes('[ ]') && !html.includes('[x]'), 'markers should not remain');
  assert.ok(html.includes('pending') && html.includes('done'), 'item text should be preserved');
});

test('Task list: uppercase [X] also counts as checked', () => {
  const { html } = renderMarkdown('- [X] uppercase\n');
  assert.ok(html.includes('checked=""'), '[X] should be checked');
});

test('Task list: ordered lists are not converted, literal markers remain', () => {
  const { html } = renderMarkdown('1. [ ] one\n2. [x] two\n');
  assert.ok(!html.includes('task-list-item-checkbox'), 'ordered lists should not get checkboxes');
  assert.ok(html.includes('[ ]') && html.includes('[x]'), 'literal markers should remain');
});

test('Task list: regular list items are unaffected', () => {
  const { html } = renderMarkdown('- regular item\n- another item\n');
  assert.ok(!html.includes('contains-task-list'), 'plain lists should not get the class');
  assert.ok(!html.includes('task-list-item-checkbox'));
});

test('Footnotes: [^1] becomes a superscript reference and a bottom footnote section with backref', () => {
  const { html } = renderMarkdown('Body text[^1].\n\n[^1]: Footnote content\n');
  assert.ok(html.includes('class="footnote-ref"'), 'should have a superscript reference');
  assert.ok(html.includes('id="fn1"'), 'should have a footnote item');
  assert.ok(html.includes('class="footnote-backref"'), 'should have a backref link');
  assert.ok(html.includes('Footnote content'));
  assert.ok(!html.includes('[^1]'), 'marker should not remain');
});

test('Anchors: headings get a slug id and anchor link, preserving CJK characters', () => {
  const { html } = renderMarkdown('# 安裝指南\n');
  assert.ok(html.includes('<h1 id="安裝指南">'), 'heading should keep a CJK slug id');
  assert.ok(html.includes('class="header-anchor"'), 'an anchor link should be inserted');
  assert.ok(html.includes('href="#安裝指南"'), 'the anchor should point at its own id');
});

test('Anchors: duplicate headings get numeric suffixes; punctuation stripped, spaces hyphenated', () => {
  const { html } = renderMarkdown('# Hello, World!\n# Hello, World!\n');
  assert.ok(html.includes('id="hello-world"'), 'first should be hello-world');
  assert.ok(html.includes('id="hello-world-1"'), 'duplicate should get a suffix');
});

test('Definition lists: term and definition become dl/dt/dd', () => {
  const { html } = renderMarkdown('Term\n: Definition text\n');
  assert.ok(html.includes('<dl>'));
  assert.ok(html.includes('<dt>Term</dt>'));
  assert.ok(html.includes('<dd>Definition text</dd>'));
});

test('Mark: ==text== becomes mark', () => {
  const { html } = renderMarkdown('this is a ==highlighted== part\n');
  assert.ok(html.includes('<mark>highlighted</mark>'));
});

test('Superscript/subscript: ^x^ and ~x~ become sup/sub without breaking strikethrough', () => {
  const { html } = renderMarkdown('x^2^ and H~2~O and ~~deleted~~\n');
  assert.ok(html.includes('x<sup>2</sup>'), 'superscript');
  assert.ok(html.includes('H<sub>2</sub>O'), 'subscript');
  assert.ok(html.includes('<s>deleted</s>'), 'strikethrough still works');
});

test('Emoji: shortcodes become Unicode characters', () => {
  const { html } = renderMarkdown('done :rocket:\n');
  assert.ok(html.includes('🚀'), ':rocket: should become a rocket');
  assert.ok(!html.includes(':rocket:'), 'shortcode should not remain');
});

test('Abbreviations: a *[ABBR]: definition makes the body text use abbr', () => {
  const { html } = renderMarkdown('*[HTML]: HyperText Markup Language\n\nHTML is useful\n');
  assert.ok(html.includes('<abbr title="HyperText Markup Language">HTML</abbr>'));
});

test('Insert: ++text++ becomes ins', () => {
  const { html } = renderMarkdown('this is ++inserted++ content\n');
  assert.ok(html.includes('<ins>inserted</ins>'));
});

test('Custom containers: :::name becomes a div with custom-block classes, content still parsed', () => {
  const { html } = renderMarkdown(':::tip Hint\n**bold** inside the container\n:::\n');
  assert.ok(html.includes('<div class="custom-block custom-block-tip">'));
  assert.ok(html.includes('<strong>bold</strong>'), 'Markdown inside the container should still parse');
});

test('TOC: [[toc]] is replaced by a nested TOC whose links match heading ids', () => {
  const { html } = renderMarkdown('[[toc]]\n\n# Install\n## Requirements\n# Usage\n');
  assert.ok(html.includes('class="table-of-contents"'), 'a TOC should be generated');
  assert.ok(html.includes('<a href="#install">Install</a>'), 'TOC links should match heading ids');
  assert.ok(html.includes('<a href="#requirements">Requirements</a>'));
  assert.ok(!html.includes('[[toc]]'), 'the placeholder should not remain');
});

test('TOC: no TOC is generated without a [[toc]] marker', () => {
  const { html } = renderMarkdown('# Install\nBody text\n');
  assert.ok(!html.includes('table-of-contents'));
});
