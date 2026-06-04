// GFM Task List（任務清單）外掛：將 `- [ ]`／`- [x]` 開頭的清單項轉為核取方塊
// 與 GitHub 一致，核取方塊為唯讀（disabled）僅供展示，不可勾選
// 清單容器加上 contains-task-list、項目加上 task-list-item 類別供樣式定位

const MARKER_RE = /^\[([ xX])\] /;

// 判斷 index 處的 inline token 是否為任務清單項的內容：
// 須為 list_item > paragraph > inline 結構，且內容首為 [ ] / [x] 標記
function isTaskItem(tokens, index) {
  return (
    tokens[index]?.type === 'inline' &&
    tokens[index - 1]?.type === 'paragraph_open' &&
    tokens[index - 2]?.type === 'list_item_open' &&
    MARKER_RE.test(tokens[index].content)
  );
}

// 自 index（某 list_item_open）往回找包住它的父層清單開啟 token，回傳其索引
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
 * markdown-it 外掛：於 inline 解析後掃描 token 流，將任務清單項改寫為核取方塊
 * @param {import('markdown-it')} md
 */
export function taskLists(md) {
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (!isTaskItem(tokens, i)) continue;

      // 與 GitHub 一致：僅無序清單（bullet list）內的項目才轉為任務清單
      const parent = parentListOpen(tokens, i - 2);
      if (parent === -1 || tokens[parent].type !== 'bullet_list_open') continue;

      const inline = tokens[i];
      const m = inline.content.match(MARKER_RE);
      const checked = m[1] !== ' ';

      // 自 inline 內容與其首個文字子節點移除標記（含尾隨空白，共 4 字元）
      inline.content = inline.content.slice(m[0].length);
      inline.children[0].content = inline.children[0].content.slice(m[0].length);
      // 於子節點開頭插入核取方塊
      inline.children.unshift(checkboxToken(state, checked));

      // 項目加上 task-list-item 類別
      tokens[i - 2].attrJoin('class', 'task-list-item');
      // 父層清單加上 contains-task-list 類別（同一清單僅加一次）
      if (!/\bcontains-task-list\b/.test(tokens[parent].attrGet('class') || '')) {
        tokens[parent].attrJoin('class', 'contains-task-list');
      }
    }
  });
}
