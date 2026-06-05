// Heading anchor plugin: generates GitHub-style slug ids for headings at every level
// and inserts a clickable anchor link
// Slug rules: trim, lowercase, strip punctuation, spaces to hyphens, keeping Unicode
// letters such as CJK
// Duplicate headings are deduplicated with -1, -2, ... so every id is unique within
// the document, for in-page jumps and TOC links

// Build a slug from heading text: keep letters, digits, spaces and hyphens, drop everything else
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-]/gu, '')
    .replace(/\s+/g, '-');
}

function anchorToken(state, slug) {
  const token = new state.Token('html_inline', '', 0);
  token.content = `<a class="header-anchor" href="#${slug}" aria-label="Permalink to this heading">#</a>`;
  return token;
}

/**
 * markdown-it plugin: at the end of the core chain, scan heading tokens and add
 * a unique id plus an anchor link
 * @param {import('markdown-it')} md
 */
export function headingAnchors(md) {
  md.core.ruler.push('heading_anchors', (state) => {
    const taken = new Set();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      if (inline?.type !== 'inline') continue;

      // Slug from the heading's plain text, falling back to "section" for empty
      // headings; duplicates get a numeric suffix
      const base = slugify(inline.content) || 'section';
      let slug = base;
      for (let n = 1; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);

      tokens[i].attrSet('id', slug);
      // Insert the anchor link as the heading's first child (inline.content stays
      // untouched, keeping the plain text available for the TOC later)
      inline.children.unshift(anchorToken(state, slug));
    }
  });
}
