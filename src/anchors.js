// Heading anchor plugin: generates GitHub-style slug ids for headings at every level
// and inserts a clickable anchor link
// Slug rules: trim, lowercase, strip punctuation, spaces to hyphens, keeping Unicode
// letters such as CJK
// A trailing "{#custom-id}" marker overrides the auto slug, so the anchor stays stable
// regardless of how the heading text later changes
// Duplicate auto slugs are deduplicated with -1, -2, ... so every id is unique within
// the document, for in-page jumps and TOC links
// This module also exports a block-anchor plugin: a standalone "{#id}" line becomes an
// invisible <span id> target, for linking to a spot that should not be a heading

// Trailing explicit-id marker, e.g. "## Title {#install}"; the id keeps the same
// character set as a generated slug (letters, digits, hyphen, underscore)
const EXPLICIT_ID_RE = /\s*\{#([\w-]+)\}\s*$/;

// Standalone block anchor: a line whose only content is "{#id}", used to drop an
// invisible anchor target at a spot that should not be turned into a heading
const BLOCK_ANCHOR_RE = /^\{#([\w-]+)\}$/;

// Build a slug from heading text: keep letters, digits, spaces and hyphens, drop everything else
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-]/gu, '')
    .replace(/\s+/g, '-');
}

// Strip the trailing "{#id}" marker from the rendered heading by trimming the last
// text child, so the marker never shows up in the output
function stripExplicitMarker(children) {
  for (let j = children.length - 1; j >= 0; j--) {
    if (children[j].type !== 'text') continue;
    children[j].content = children[j].content.replace(EXPLICIT_ID_RE, '');
    return;
  }
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

      // An explicit "{#id}" marker wins and is used verbatim (no dedup suffix, so it
      // stays stable); otherwise slug the plain text, falling back to "section" for
      // empty headings, and suffix duplicates
      const explicit = inline.content.match(EXPLICIT_ID_RE);
      let slug;
      if (explicit) {
        slug = explicit[1];
        // Drop the marker from both the plain text (TOC and heading text read
        // inline.content) and the rendered children
        inline.content = inline.content.replace(EXPLICIT_ID_RE, '');
        stripExplicitMarker(inline.children);
      } else {
        const base = slugify(inline.content) || 'section';
        slug = base;
        for (let n = 1; taken.has(slug); n++) slug = `${base}-${n}`;
      }
      taken.add(slug);

      tokens[i].attrSet('id', slug);
      // Insert the anchor link as the heading's first child (inline.content stays
      // untouched, keeping the plain text available for the TOC later)
      inline.children.unshift(anchorToken(state, slug));
    }
  });
}

// Whether a paragraph holds nothing but a "{#id}" block-anchor marker
function isBlockAnchor(tokens, i) {
  return (
    tokens[i].type === 'paragraph_open' &&
    tokens[i + 1]?.type === 'inline' &&
    tokens[i + 2]?.type === 'paragraph_close' &&
    BLOCK_ANCHOR_RE.test(tokens[i + 1].content.trim())
  );
}

/**
 * markdown-it plugin: replace a standalone "{#id}" line with an empty <span id>,
 * an invisible anchor target for linking to a spot that is not a heading
 * The marker must sit on its own line (blank line around it) so it parses as its
 * own paragraph; the resulting span sits just above the following block, so jumps
 * land a touch above the target rather than flush with its top edge
 * @param {import('markdown-it')} md
 */
export function blockAnchors(md) {
  md.core.ruler.push('block_anchors', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (!isBlockAnchor(tokens, i)) continue;
      const id = tokens[i + 1].content.trim().match(BLOCK_ANCHOR_RE)[1];
      // Replace the placeholder paragraph (3 tokens) with a single html_block; after
      // splice, i points at the new token, so the scan continues onward
      const token = new state.Token('html_block', '', 0);
      token.content = `<span id="${id}" class="block-anchor"></span>\n`;
      token.block = true;
      tokens.splice(i, 3, token);
    }
  });
}
