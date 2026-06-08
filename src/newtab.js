// New-tab plugin: makes every link that navigates away from the current document open in a new tab/window,
// adding target="_blank" plus the matching rel="noopener noreferrer" guard;
// only in-page `#` anchors and non-navigational schemes (mailto:, tel:, ...) stay put
//
// Rationale: Tarmdas converts standalone documents, not a website with back/forward or home navigation chrome,
// so any link to another document is naturally a new-tab target

// Decide whether an href points to another document and should open in a new tab:
// - `#fragment` (in-page anchor) and empty hrefs stay in the same tab
// - a URL scheme opens a new tab only when it actually navigates (http/https/file);
//   non-navigational schemes such as mailto:/tel: are left alone
// - protocol-relative (`//host`) and schemeless relative/absolute paths are other documents
function opensInNewTab(href) {
  if (!href || href.startsWith('#')) return false;
  if (href.startsWith('//')) return true; // protocol-relative, i.e. external
  const scheme = href.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) return /^(?:https?|file)$/i.test(scheme[1]);
  return true; // schemeless relative/absolute path → another document
}

/**
 * markdown-it plugin: add target="_blank" and rel="noopener noreferrer" to links that
 * navigate to another document so they open in a new tab/window
 * @param {import('markdown-it')} md
 */
export function newTabLinks(md) {
  // Runs as a core rule so it sees hrefs already rewritten by earlier plugins
  // (e.g. homePaths turning `~`/`@/` targets into file:// URLs)
  md.core.ruler.push('new_tab_links', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue;
      for (const child of token.children) {
        if (child.type !== 'link_open') continue;
        const href = child.attrGet('href');
        if (!href || !opensInNewTab(href)) continue;
        child.attrSet('target', '_blank');
        child.attrSet('rel', 'noopener noreferrer');
      }
    }
  });
}
