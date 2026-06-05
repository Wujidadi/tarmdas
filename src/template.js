// HTML document assembly: skeleton, inlined CSS/JS, and the Live Reload client script for watch mode
// Body styling comes from the theme (see src/themes.js), passed in via styles

// Wrap multiple CSS chunks in a <style>
function styleTag(cssParts) {
  const css = cssParts.filter(Boolean).join('\n');
  return css ? `<style>\n${css}\n</style>` : '';
}

// Wrap multiple JS chunks in a <script>
function scriptTag(jsParts) {
  const js = jsParts.filter(Boolean).join('\n');
  return js ? `<script>\n${js}\n</script>` : '';
}

// Live Reload client: listen on SSE and refresh on a reload event
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
 * Assemble the complete HTML document
 * @param {object} opts
 * @param {string} opts.title               Document title
 * @param {string} opts.body                Rendered, asset-processed HTML fragment
 * @param {string[]} [opts.styles]          CSS to inline (theme, hljs, KaTeX, user CSS)
 * @param {string[]} [opts.scripts]         Extra JS to inline (Mermaid, etc.)
 * @param {boolean} [opts.liveReload=false] Whether to inject the Live Reload script
 * @param {string} [opts.lang='en']         HTML lang attribute
 * @returns {string}
 */
export function buildHtml(opts) {
  const {
    title = 'Document',
    body,
    styles = [],
    scripts = [],
    liveReload = false,
    lang = 'en',
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
