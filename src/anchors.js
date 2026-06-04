// 標題錨點外掛：為各級標題產生 GitHub 風格的 slug id，並插入可點擊的錨點連結
// slug 規則：去除前後空白、轉小寫、移除標點符號、空白轉連字號，保留中日韓等 Unicode 文字
// 同名標題以 -1、-2 ……去重，使每個 id 在文件內唯一，供頁內跳轉與目錄連結使用

// 由標題文字產生 slug：保留字母、數字、空白與連字號，其餘一律移除
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-]/gu, '')
    .replace(/\s+/g, '-');
}

function anchorToken(state, slug) {
  const token = new state.Token('html_inline', '', 0);
  token.content = `<a class="header-anchor" href="#${slug}" aria-label="此標題的永久連結">#</a>`;
  return token;
}

/**
 * markdown-it 外掛：於 core 處理鏈尾端掃描標題 token，補上唯一 id 與錨點連結
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

      // 以標題純文字產生 slug，空標題退回 section；同名則加序號去重
      const base = slugify(inline.content) || 'section';
      let slug = base;
      for (let n = 1; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);

      tokens[i].attrSet('id', slug);
      // 將錨點連結插為標題第一個子節點（不更動 inline.content，保留純文字供日後目錄使用）
      inline.children.unshift(anchorToken(state, slug));
    }
  });
}
