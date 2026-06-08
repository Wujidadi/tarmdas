// Home-path plugin: expands a leading `~` (the user's home directory) or `@` (a
// configured base directory) in link and image targets into an absolute file:// URL,
// so `[draft](~/notes/draft.md)` and `![pic](@/img.png)` point at the real local file
// when the HTML is opened offline
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Join a root directory with a (possibly percent-encoded) target tail
function joinDecoded(root, tail) {
  let rest = tail;
  // markdown-it percent-encodes link targets; decode the tail before joining so the
  // expanded path holds real characters, falling back to the raw text on bad encoding
  try {
    rest = decodeURI(tail);
  } catch {
    /* keep the raw tail */
  }
  return path.join(root, rest);
}

// Expand a `~`/`~/...` (home) or `@/...` (base directory) target into an absolute path;
// return null for anything else (other-user forms like `~bob` are intentionally left
// untouched as too ambiguous, and `@/` only expands when a base directory is configured)
function expandTarget(target, homedir, basedir) {
  if (target === '~') return homedir;
  if (target.startsWith('~/')) return joinDecoded(homedir, target.slice(2));
  if (basedir && target.startsWith('@/')) return joinDecoded(basedir, target.slice(2));
  return null;
}

/**
 * markdown-it plugin: rewrite `~`-rooted (home) and `@`-rooted (base directory) link
 * href and image src into file:// URLs
 * @param {import('markdown-it')} md
 * @param {object} [opts]
 * @param {string} [opts.homedir] Home directory used for `~` expansion (default os.homedir())
 * @param {string} [opts.basedir] Absolute base directory used for `@/` expansion (no `@/` expansion when unset)
 */
export function homePaths(md, opts = {}) {
  const homedir = opts.homedir ?? os.homedir();
  const { basedir } = opts;

  md.core.ruler.push('home_paths', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue;
      for (const child of token.children) {
        const attr =
          child.type === 'link_open' ? 'href' : child.type === 'image' ? 'src' : null;
        if (!attr) continue;
        const value = child.attrGet(attr);
        if (!value) continue;
        const abs = expandTarget(value, homedir, basedir);
        if (abs != null) child.attrSet(attr, pathToFileURL(abs).href);
      }
    }
  });
}
