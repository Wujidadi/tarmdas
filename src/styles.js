// 使用者自訂樣式編譯：依副檔名選擇 SASS/SCSS、LESS 或原生 CSS
// sass / less 為選用依賴，僅在實際用到時才動態載入
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function compileScss(file) {
  let sass;
  try {
    // 使用命名空間匯入（sass 已棄用 default 匯入）
    sass = await import('sass');
  } catch {
    throw new Error(
      `處理 ${path.basename(file)} 需要 "sass" 套件，請先安裝：npm install sass`,
    );
  }
  const result = await sass.compileAsync(file, { style: 'expanded', loadPaths: [path.dirname(file)] });
  return result.css;
}

async function compileLess(file) {
  let less;
  try {
    less = (await import('less')).default ?? (await import('less'));
  } catch {
    throw new Error(
      `處理 ${path.basename(file)} 需要 "less" 套件，請先安裝：npm install less`,
    );
  }
  const input = await readFile(file, 'utf8');
  const result = await less.render(input, { filename: file, paths: [path.dirname(file)] });
  return result.css;
}

/**
 * 編譯單一樣式檔為 CSS 字串
 * @param {string} file 樣式檔路徑（.css/.scss/.sass/.less）
 * @returns {Promise<string>}
 */
export async function compileStyle(file) {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case '.scss':
    case '.sass':
      return compileScss(file);
    case '.less':
      return compileLess(file);
    case '.css':
      return readFile(file, 'utf8');
    default:
      throw new Error(`不支援的樣式副檔名：${ext}（支援 .css/.scss/.sass/.less）`);
  }
}

/**
 * 編譯多個使用者樣式檔並串接為單一 CSS 字串
 * @param {string[]} files
 * @returns {Promise<string>}
 */
export async function compileStyles(files = []) {
  const parts = [];
  for (const file of files) {
    parts.push(await compileStyle(file));
  }
  return parts.join('\n');
}
