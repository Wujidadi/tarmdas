// HTML 文件組裝：骨架、內嵌 CSS/JS，以及 watch 模式的 Live Reload 客戶端腳本
// 正文樣式由主題提供（見 src/themes.js），透過 styles 傳入

// 將多段 CSS 包進 <style>
function styleTag(cssParts) {
  const css = cssParts.filter(Boolean).join('\n');
  return css ? `<style>\n${css}\n</style>` : '';
}

// 將多段 JS 包進 <script>
function scriptTag(jsParts) {
  const js = jsParts.filter(Boolean).join('\n');
  return js ? `<script>\n${js}\n</script>` : '';
}

// Live Reload 客戶端：監聽 SSE，收到 reload 事件即重新整理
const LIVE_RELOAD_SCRIPT = `
(function () {
  try {
    var es = new EventSource('/__tarmdas_reload');
    es.addEventListener('reload', function () { location.reload(); });
  } catch (e) {}
})();
`.trim();

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * 組裝完整 HTML 文件
 * @param {object} opts
 * @param {string} opts.title               文件標題
 * @param {string} opts.body                已渲染並處理過資產的 HTML 片段
 * @param {string[]} [opts.styles]          要內嵌的 CSS（主題、hljs、KaTeX、使用者 CSS）
 * @param {string[]} [opts.scripts]         要內嵌的額外 JS（Mermaid 等）
 * @param {boolean} [opts.liveReload=false] 是否注入 Live Reload 腳本
 * @param {string} [opts.lang='zh-Hant']    HTML lang 屬性
 * @returns {string}
 */
export function buildHtml(opts) {
  const {
    title = 'Document',
    body,
    styles = [],
    scripts = [],
    liveReload = false,
    lang = 'zh-Hant',
  } = opts;

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    styleTag(styles),
  ].filter(Boolean).join('\n  ');

  const bodyScripts = scriptTag([...scripts, liveReload ? LIVE_RELOAD_SCRIPT : '']);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  ${head}
</head>
<body>
${body}
${bodyScripts}
</body>
</html>
`;
}
