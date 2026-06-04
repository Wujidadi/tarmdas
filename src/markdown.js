// markdown-it 實例組裝：程式碼高亮（highlight.js）、數學（KaTeX via texmath）、Mermaid fence
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js';

// Mermaid 區塊以 <pre class="mermaid"> 輸出原始碼，交由瀏覽器端 mermaid.js 渲染
function renderMermaid(md, code) {
  return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`;
}

// 程式碼高亮：回傳完整 <pre>，markdown-it 偵測到開頭為 <pre 便不再包一層
function highlight(md, str, lang) {
  if (lang === 'mermaid') {
    return renderMermaid(md, str);
  }
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`;
    } catch {
      /* 落到下方預設處理 */
    }
  }
  return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
}

/**
 * 建立並設定 markdown-it 實例
 * @param {object} [opts]
 * @param {boolean} [opts.math=true]      啟用 KaTeX
 * @param {boolean} [opts.highlight=true] 啟用程式碼高亮
 * @returns {MarkdownIt}
 */
export function createMarkdownIt(opts = {}) {
  const { math = true, highlight: useHighlight = true } = opts;

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight: useHighlight ? (str, lang) => highlight(md, str, lang) : undefined,
  });

  // 未啟用高亮時，仍需攔截 mermaid fence
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

  return md;
}

/**
 * 渲染 Markdown 文字為 HTML 片段，並回報實際使用到的功能（供按需內嵌資產）
 * @param {string} source Markdown 原始碼
 * @param {object} [opts] 傳給 createMarkdownIt 的選項
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
