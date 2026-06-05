// GFM task list plugin: turns list items starting with `- [ ]` / `- [x]` into checkboxes
// Matching GitHub, checkboxes are read-only (disabled), display-only, not clickable
// The list container gets contains-task-list and items get task-list-item classes for styling

const MARKER_RE = /^\[([ xX])\] /;

// Whether the inline token at index is task-list-item content:
// must be a list_item > paragraph > inline structure whose content starts with a [ ] / [x] marker
function isTaskItem(tokens, index) {
  return (
    tokens[index]?.type === 'inline' &&
    tokens[index - 1]?.type === 'paragraph_open' &&
    tokens[index - 2]?.type === 'list_item_open' &&
    MARKER_RE.test(tokens[index].content)
  );
}

// From index (a list_item_open), walk back to the enclosing parent list's opening token and return its index
function parentListOpen(tokens, index) {
  for (let i = index, depth = 0; i >= 0; i--) {
    const t = tokens[i].type;
    if (t === 'list_item_close') depth++;
    else if (t === 'list_item_open') {
      if (depth === 0) continue;
      depth--;
    } else if ((t === 'bullet_list_open' || t === 'ordered_list_open') && depth === 0) {
      return i;
    }
  }
  return -1;
}

function checkboxToken(state, checked) {
  const token = new state.Token('html_inline', '', 0);
  token.content =
    `<input class="task-list-item-checkbox"${checked ? ' checked=""' : ''} disabled="" type="checkbox"> `;
  return token;
}

/**
 * markdown-it plugin: after inline parsing, scan the token stream and rewrite
 * task list items into checkboxes
 * @param {import('markdown-it')} md
 */
export function taskLists(md) {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (!isTaskItem(tokens, i)) continue;

      // Matching GitHub: only items inside unordered (bullet) lists become task items
      const parent = parentListOpen(tokens, i - 2);
      if (parent === -1 || tokens[parent].type !== 'bullet_list_open') continue;

      const inline = tokens[i];
      const m = inline.content.match(MARKER_RE);
      const checked = m[1] !== ' ';

      // Remove the marker (with its trailing space, 4 characters total) from the inline
      // content and its first text child
      inline.content = inline.content.slice(m[0].length);
      inline.children[0].content = inline.children[0].content.slice(m[0].length);
      // Insert the checkbox at the start of the children
      inline.children.unshift(checkboxToken(state, checked));

      // Add the task-list-item class to the item
      tokens[i - 2].attrJoin('class', 'task-list-item');
      // Add the contains-task-list class to the parent list (only once per list)
      if (!/\bcontains-task-list\b/.test(tokens[parent].attrGet('class') || '')) {
        tokens[parent].attrJoin('class', 'contains-task-list');
      }
    }
  });
}
