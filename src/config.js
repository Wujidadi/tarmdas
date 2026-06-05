// 專案層級配置檔：自輸入檔所在目錄向上逐層尋找 tarmdas.config.json，作為選項的預設值來源（優先序：內建預設 < 配置檔 < CLI 旗標）
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_FILENAME = 'tarmdas.config.json';

// 配置檔允許的欄位（對應 CLI 長旗標的 camelCase 形式）
// title、output 等「每次轉檔各異」的選項不開放於配置檔設定
export const ALLOWED_KEYS = [
  'theme',
  'highlightTheme',
  'css',
  'externalAssets',
  'maxInlineSize',
  'maxWidth',
  'fontSize',
  'breaks',
  'math',
  'mermaid',
  'highlight',
  'port',
];

/**
 * 自 startDir 向上逐層尋找配置檔，回傳第一個找到的路徑
 * @param {string} startDir 起始目錄（通常為輸入檔所在目錄）
 * @returns {Promise<string|null>} 配置檔絕對路徑，找不到則為 null
 */
export async function findConfig(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const file = path.join(dir, CONFIG_FILENAME);
    try {
      await access(file);
      return file;
    } catch {
      /* 此層沒有，往上一層 */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // 已達檔案系統根目錄
    dir = parent;
  }
}

/**
 * 尋找並載入配置檔：解析 JSON、驗證欄位，並將 css 相對路徑以配置檔所在目錄為基準解析
 * @param {string} startDir 起始目錄（通常為輸入檔所在目錄）
 * @returns {Promise<{ config: object, configPath: string|null }>} 找不到配置檔時 config 為空物件
 */
export async function loadConfig(startDir) {
  const configPath = await findConfig(startDir);
  if (!configPath) return { config: {}, configPath: null };

  let data;
  try {
    data = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`無法解析配置檔 ${configPath}：${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`配置檔 ${configPath} 的頂層必須是 JSON 物件`);
  }

  const unknown = Object.keys(data).filter((k) => !ALLOWED_KEYS.includes(k));
  if (unknown.length) {
    throw new Error(
      `配置檔 ${configPath} 含未知欄位：${unknown.join('、')}\n\n可用欄位：${ALLOWED_KEYS.join(', ')}`,
    );
  }

  const config = { ...data };
  // css 可為單一字串或陣列；相對路徑以配置檔所在目錄為基準，與執行時的 cwd 無關
  if (config.css != null) {
    const list = Array.isArray(config.css) ? config.css : [config.css];
    config.css = list.map((f) => path.resolve(path.dirname(configPath), f));
  }
  return { config, configPath };
}
