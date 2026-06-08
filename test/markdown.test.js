import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

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

test('GitHub Alerts: [!DATE] accepts a custom label that replaces the default title', () => {
  const { html } = renderMarkdown('> [!DATE] Last updated: 2026-06-06\n> body text\n');
  assert.ok(html.includes('markdown-alert-date'), 'should still be a date alert');
  assert.ok(html.includes('Last updated: 2026-06-06'), 'custom label should appear');
  assert.ok(!html.includes('>Date<'), 'default "Date" title should be replaced');
  assert.ok(html.includes('body text'), 'body should be preserved');
  assert.ok(!html.includes('[!DATE]'), 'marker should not remain');
});

test('GitHub Alerts: [!DATE] without a label keeps the default title', () => {
  const { html } = renderMarkdown('> [!DATE]\n> body\n');
  assert.ok(html.includes('markdown-alert-date'));
  assert.ok(html.includes('>Date<'), 'default title should be present');
});

test('GitHub Alerts: a [!DATE] label is HTML-escaped', () => {
  const { html } = renderMarkdown('> [!DATE] <script>alert(1)</script>\n');
  assert.ok(!html.includes('<script>'), 'raw HTML in the label must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'label should be escaped');
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

test('Home paths: a leading ~ in a link expands to a file:// URL', () => {
  const { html } = renderMarkdown('[draft](~/Documents/draft.md)\n', { homedir: '/home/tester' });
  assert.ok(html.includes('href="file:///home/tester/Documents/draft.md"'), 'link should expand to file://');
  assert.ok(!html.includes('~/Documents'), 'the literal ~ should not remain');
});

test('Home paths: a bare ~ link expands to the home directory itself', () => {
  const { html } = renderMarkdown('[home](~)\n', { homedir: '/home/tester' });
  assert.ok(html.includes('href="file:///home/tester"'), 'bare ~ should expand to the home directory');
});

test('Home paths: ~ in an image src is also expanded', () => {
  const { html } = renderMarkdown('![pic](~/img/photo.png)\n', { homedir: '/home/tester' });
  assert.ok(html.includes('src="file:///home/tester/img/photo.png"'), 'image src should expand to file://');
});

test('Home paths: CJK characters round-trip into a valid percent-encoded file:// URL', () => {
  const { html } = renderMarkdown('[草案](~/文件/草案.md)\n', { homedir: '/home/tester' });
  const expected = pathToFileURL('/home/tester/文件/草案.md').href;
  assert.ok(html.includes(`href="${expected}"`), `should expand to ${expected}`);
});

test('Base dir: @/ expands against the configured baseDir into a file:// URL', () => {
  const { html } = renderMarkdown('[draft](@/plan/draft.md)\n', { baseDir: '/home/tester/Work/HS' });
  assert.ok(html.includes('href="file:///home/tester/Work/HS/plan/draft.md"'), '@/ should expand to baseDir');
  assert.ok(!html.includes('@/plan'), 'the literal @/ should not remain');
});

test('Base dir: @/ in an image src is also expanded', () => {
  const { html } = renderMarkdown('![pic](@/img/photo.png)\n', { baseDir: '/home/tester/Work/HS' });
  assert.ok(html.includes('src="file:///home/tester/Work/HS/img/photo.png"'), 'image @/ should expand to baseDir');
});

test('Base dir: @/ is left untouched when no baseDir is configured', () => {
  const { html } = renderMarkdown('[x](@/plan/draft.md)\n');
  assert.ok(html.includes('href="@/plan/draft.md"'), 'without baseDir, @/ stays literal');
});

test('Home paths: relative, absolute, remote and ~user targets are left untouched', () => {
  const { html } = renderMarkdown(
    '[rel](./a.md) [abs](/etc/x) [web](https://e.com/p) [user](~bob/x)\n',
    { homedir: '/home/tester' },
  );
  assert.ok(html.includes('href="./a.md"'), 'relative link unchanged');
  assert.ok(html.includes('href="/etc/x"'), 'absolute link unchanged');
  assert.ok(html.includes('href="https://e.com/p"'), 'remote link unchanged');
  assert.ok(html.includes('~bob/x'), 'the ambiguous ~user form is left untouched');
});

test('New tab: external http(s) links get target=_blank and the rel guard by default', () => {
  const { html } = renderMarkdown('[web](https://e.com/p)\n');
  assert.ok(
    html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'),
    'external link should open in a new tab with the rel guard',
  );
});

test('New tab: protocol-relative links also open in a new tab', () => {
  const { html } = renderMarkdown('[web](//e.com/p)\n');
  assert.ok(html.includes('target="_blank"'), 'protocol-relative link should open in a new tab');
});

test('New tab: relative and absolute path links also open in a new tab (other documents)', () => {
  const { html } = renderMarkdown('[rel](./a.md) and [abs](/docs/x.html)\n');
  assert.equal(
    (html.match(/target="_blank"/g) || []).length,
    2,
    'both the relative and absolute path links should open in a new tab',
  );
});

test('New tab: literal file:// links resolve (validateLink allows file:) and open in a new tab', () => {
  const { html } = renderMarkdown('[doc](file:///tmp/a.html)\n');
  assert.ok(html.includes('href="file:///tmp/a.html"'), 'a literal file:// href is no longer stripped');
  assert.ok(html.includes('target="_blank"'), 'the file:// link should open in a new tab');
});

test('New tab: ~ home-path links expanded to file:// also open in a new tab', () => {
  const { html } = renderMarkdown('[draft](~/notes/draft.md)\n', { homedir: '/home/tester' });
  assert.ok(html.includes('href="file:///home/tester/notes/draft.md"'), 'home path expands to file://');
  assert.ok(html.includes('target="_blank"'), 'the expanded file:// link should open in a new tab');
});

test('New tab: in-page # anchors and non-navigational schemes stay in the same tab', () => {
  const { html } = renderMarkdown('[here](#section) and [mail](mailto:a@e.com) and [call](tel:123)\n');
  assert.ok(!html.includes('target='), 'anchors, mailto: and tel: links get no target');
});

test('New tab: javascript: links stay blocked even though file: is allowed', () => {
  // validateLink rejects javascript:, so markdown-it never builds an anchor (the marker is
  // left as inert escaped text); assert no <a>/href is emitted rather than scanning raw text
  const { html } = renderMarkdown('[x](javascript:alert(1))\n');
  assert.ok(!/<a\b/.test(html), 'no anchor element is created for a javascript: link');
  assert.ok(!html.includes('href='), 'no href is emitted for a javascript: link');
});

test('New tab: can be turned off, leaving all links in the same tab', () => {
  const { html } = renderMarkdown('[web](https://e.com/p)\n', { newTab: false });
  assert.ok(!html.includes('target='), 'no target attribute when newTab is disabled');
});
