// markdown-it instance assembly:
// - code highlighting (highlight.js)
// - math (KaTeX via texmath)
// - Mermaid fences
// - GitHub Alerts
// - GFM task lists
// - footnotes
// - heading anchors
// - definition lists
// - mark (highlighting)
// - superscript/subscript
// - emoji shortcodes
// - abbreviations
// - insert/underline
// - custom containers
// - table of contents (TOC)
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import footnote from 'markdown-it-footnote';
import deflist from 'markdown-it-deflist';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import { full as emoji } from 'markdown-it-emoji';
import abbr from 'markdown-it-abbr';
import ins from 'markdown-it-ins';
import container from 'markdown-it-container';
import katex from 'katex';
import hljs from 'highlight.js';

import { githubAlerts } from './alerts.js';
import { taskLists } from './tasklists.js';
import { headingAnchors } from './anchors.js';
import { tableOfContents } from './toc.js';

// Custom container :::name — accepts any name and emits
// <div class="custom-block custom-block-<name>"> so users can target it with custom CSS
function customContainer(md) {
  md.use(container, 'custom', {
    validate: () => true,
    render(tokens, idx) {
      if (tokens[idx].nesting !== 1) return '</div>\n';
      const name = (tokens[idx].info.trim().split(/\s+/)[0] || 'block').replace(/[^\w-]/g, '');
      return `<div class="custom-block custom-block-${name}">\n`;
    },
  });
}

// Mermaid blocks emit the raw source as <pre class="mermaid">, rendered by mermaid.js in the browser
function renderMermaid(md, code) {
  return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`;
}

// Code highlighting: return a complete <pre>; markdown-it skips its own wrapper
// when the output starts with <pre
function highlight(md, str, lang) {
  if (lang === 'mermaid') {
    return renderMermaid(md, str);
  }
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`;
    } catch {
      /* fall through to the default handling below */
    }
  }
  return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
}

/**
 * Create and configure a markdown-it instance
 * @param {object} [opts]
 * @param {boolean} [opts.math=true]      Enable KaTeX
 * @param {boolean} [opts.highlight=true] Enable code highlighting
 * @param {boolean} [opts.breaks=false]   Render single newlines inside paragraphs as <br>
 * @returns {MarkdownIt}
 */
export function createMarkdownIt(opts = {}) {
  const { math = true, highlight: useHighlight = true, breaks = false } = opts;

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    breaks,
    highlight: useHighlight ? (str, lang) => highlight(md, str, lang) : undefined,
  });

  // Even with highlighting disabled, mermaid fences still need to be intercepted
  if (!useHighlight) {
    const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const info = token.info ? token.info.trim().split(/\s+/)[0] : '';
      if (info === 'mermaid') {
        return renderMermaid(md, token.content) + '\n';
      }
      return defaultFence(tokens, idx, options, env, self);
    };
  }

  if (math) {
    md.use(texmath, {
      engine: katex,
      delimiters: 'dollars',
      katexOptions: { throwOnError: false, output: 'html' },
    });
  }

  md.use(githubAlerts);
  md.use(taskLists);
  md.use(footnote);
  md.use(deflist);
  md.use(mark);
  md.use(sub);
  md.use(sup);
  md.use(emoji);
  md.use(abbr);
  md.use(ins);
  md.use(customContainer);
  md.use(headingAnchors);
  md.use(tableOfContents); // must come after headingAnchors so TOC links match heading ids

  return md;
}

/**
 * Render Markdown text into an HTML fragment, reporting which features were actually
 * used (for on-demand asset inlining)
 * @param {string} source Markdown source
 * @param {object} [opts] Options forwarded to createMarkdownIt
 * @returns {{ html: string, features: { math: boolean, mermaid: boolean, code: boolean } }}
 */
export function renderMarkdown(source, opts = {}) {
  const md = createMarkdownIt(opts);
  const html = md.render(source);
  return {
    html,
    features: {
      math: /class="katex/.test(html),
      mermaid: /class="mermaid"/.test(html),
      code: /class="hljs"/.test(html),
    },
  };
}
