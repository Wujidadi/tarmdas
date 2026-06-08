// Home-path plugin: expands a leading `~` (the user's home directory) in link and
// image targets into an absolute file:// URL, so `[draft](~/notes/draft.md)` and
// `![pic](~/img.png)` point at the real local file when the HTML is opened offline
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Expand a `~` / `~/...` target into an absolute path; return null for anything else
// (other-user forms like `~bob` are intentionally left untouched as too ambiguous)
function expandHome(target, homedir) {
  if (target === '~') return homedir;
  if (target.startsWith('~/')) {
    // markdown-it percent-encodes link targets; decode the tail before joining so the
    // expanded path holds real characters, falling back to the raw text on bad encoding
    let rest = target.slice(2);
    try {
      rest = decodeURI(rest);
    } catch {
      /* keep the raw tail */
    }
    return path.join(homedir, rest);
  }
  return null;
}

/**
 * markdown-it plugin: rewrite `~`-rooted link href and image src into file:// URLs
 * @param {import('markdown-it')} md
 * @param {object} [opts]
 * @param {string} [opts.homedir] Home directory used for expansion (default os.homedir())
 */
export function homePaths(md, opts = {}) {
  const homedir = opts.homedir ?? os.homedir();

  md.core.ruler.push('home_paths', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue;
      for (const child of token.children) {
        const attr =
          child.type === 'link_open' ? 'href' : child.type === 'image' ? 'src' : null;
        if (!attr) continue;
        const value = child.attrGet(attr);
        if (!value) continue;
        const abs = expandHome(value, homedir);
        if (abs != null) child.attrSet(attr, pathToFileURL(abs).href);
      }
    }
  });
}
