// 目錄（TOC）外掛：將獨佔一行的 [[toc]] 或 [toc] 佔位標記，替換為依標題層級巢狀的目錄
// 目錄連結指向各標題由 anchors 外掛產生的 id，故本外掛須在 headingAnchors 之後註冊執行
// 標題純文字取自 inline.content（anchors 僅於 children 插入錨點，未更動 content），不含錨點符號

const TOC_RE = /^(\[\[toc\]\]|\[toc\])$/i;

// 段落是否為 TOC 佔位標記：paragraph_open + inline（內容恰為標記）+ paragraph_close
function isTocMarker(tokens, i) {
  return (
    tokens[i].type === 'paragraph_open' &&
    tokens[i + 1]?.type === 'inline' &&
    tokens[i + 2]?.type === 'paragraph_close' &&
    TOC_RE.test(tokens[i + 1].content.trim())
  );
}

function collectHeadings(tokens) {
  const headings = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    if (inline?.type !== 'inline') continue;
    headings.push({
      level: Number(tokens[i].tag.slice(1)),
      id: tokens[i].attrGet('id') || '',
      text: inline.content,
    });
  }
  return headings;
}

// 由扁平的標題清單（含層級）產生巢狀 <ul> 目錄，深層標題巢套於上一層項目內
function tocHtml(headings, escapeHtml) {
  if (!headings.length) return '<nav class="table-of-contents"></nav>\n';
  const base = Math.min(...headings.map((h) => h.level));
  const parts = ['<ul>'];
  let level = base;
  let openLi = false;
  for (const h of headings) {
    if (h.level > level) {
      for (let l = level; l < h.level; l++) parts.push('<ul>');
    } else {
      if (openLi) parts.push('</li>');
      for (let l = level; l > h.level; l--) parts.push('</ul>', '</li>');
    }
    level = h.level;
    parts.push(`<li><a href="#${h.id}">${escapeHtml(h.text)}</a>`);
    openLi = true;
  }
  if (openLi) parts.push('</li>');
  for (let l = level; l > base; l--) parts.push('</ul>', '</li>');
  parts.push('</ul>');
  return `<nav class="table-of-contents">\n${parts.join('\n')}\n</nav>\n`;
}

/**
 * markdown-it 外掛：於 core 處理鏈尾端（標題已具 id 後）將 TOC 佔位標記替換為目錄
 * @param {import('markdown-it')} md
 */
export function tableOfContents(md) {
  md.core.ruler.push('table_of_contents', (state) => {
    const tokens = state.tokens;
    // 先掃描是否存在佔位標記，沒有就直接結束，避免在無目錄的文件上多做事
    let found = false;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (isTocMarker(tokens, i)) {
        found = true;
        break;
      }
    }
    if (!found) return;

    const html = tocHtml(collectHeadings(tokens), md.utils.escapeHtml);
    // 將每處佔位段落（3 個 token）替換為單一 html_block；splice 後 i 指向新 token，繼續往後找
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (!isTocMarker(tokens, i)) continue;
      const token = new state.Token('html_block', '', 0);
      token.content = html;
      token.block = true;
      tokens.splice(i, 3, token);
    }
  });
}
