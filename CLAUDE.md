# Tarmdas — 專案開發指南

本檔提供給在此專案工作的 Claude Code 參考，說明專案定位、架構、開發慣例與 commit 規範。

## 專案概述

Tarmdas 是本地、完全離線的 Markdown → 單一 HTML 轉換工具（非建站框架）。
預設產出「自包含單檔」：CSS、字型、Mermaid 腳本、圖片全部內嵌，可用 `file://` 直接離線開啟；超過門檻的大型媒體（如影片）會自動降級為旁置資產。
核心目標是輕量、腳本式：預設一次性轉檔、不啟動伺服器，僅在 `--watch` 時才開最小化開發伺服器。

## 技術棧

| 範疇                | 採用                                                               |
| ------------------- | ------------------------------------------------------------------ |
| 執行環境            | Node.js（ESM，`"type": "module"`，engines >= 20，於 Node 26 開發） |
| Markdown 解析       | markdown-it                                                        |
| 數學                | KaTeX + markdown-it-texmath（建置期渲染，字型 base64 內嵌）        |
| 程式碼高亮          | highlight.js（建置期高亮）                                         |
| 圖表                | Mermaid（內嵌 mermaid.min.js，瀏覽器端渲染）                       |
| 樣式預處理          | sass（dart-sass，正式相依）；less 為選用相依                       |
| CLI / 伺服器 / 監看 | Node.js 內建 parseArgs、http、fs.watch + SSE                       |

## 架構與模組

進入點 `bin/tarmdas.js` → `src/cli.js`，核心管線在 `src/convert.js`。

| 檔案              | 職責                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `bin/tarmdas.js`  | CLI 進入點（shebang），呼叫 `src/cli.js` 的 `run()`                                                  |
| `src/cli.js`      | 以內建 parseArgs 解析旗標，調度一次性轉檔或 watch 模式                                               |
| `src/convert.js`  | 核心管線：`renderDocument()` 與 `convertFile()`，組裝完整文件                                        |
| `src/markdown.js` | markdown-it 實例與外掛（texmath/KaTeX、highlight.js、Mermaid fence），並回報文件實際用到的功能       |
| `src/alerts.js`   | GitHub Alerts 警示區塊外掛，將 `> [!NOTE]` 等五種標記的引用轉為帶圖示的警示區塊                      |
| `src/styles.js`   | 使用者自訂樣式編譯，依副檔名選 sass/less/原生 css（less 動態載入）                                   |
| `src/assets.js`   | KaTeX CSS（字型 base64）、highlight.js 主題、Mermaid JS，以及本地圖片/媒體處理（`processMedia`）     |
| `src/template.js` | HTML 文件骨架組裝與 Live Reload 客戶端腳本注入                                                       |
| `src/themes.js`   | 內建主題登錄表 `PRESETS`、`getPresetCss()`、`mermaidInitScript()`                                    |
| `src/watch.js`    | 開發伺服器（node:http）+ fs.watch + SSE 即時重載                                                     |
| `themes/`         | 內建主題 SCSS；`_base.scss` 為共用結構（CSS 變數驅動），`_github-palette.scss` 為 GitHub 淺/深 mixin |

## 開發慣例

- **最小相依**：優先使用 Node.js 內建能力（parseArgs、http、fs.watch、SSE），不引入重量級框架；新增相依前先確認內建是否足夠。
- **按需內嵌**：只有文件實際用到時，才內嵌對應資產（KaTeX 字型、hljs 主題、mermaid.min.js）；`renderMarkdown` 會回報 `features`，`convert.js` 據此決定。讓純文字文件維持輕巧、含 Mermaid 的文件才付出約 3 MB 的腳本成本。
- **輸出模式**：預設自包含單檔（圖片 Base64、SVG 內聯）；`--external-assets` 改為旁置資產夾；inline 模式下超過 `--max-inline-size`（預設 5 MB）的媒體會自動降級為旁置。
- **最小修改原則**：除非明確要求，對既有程式碼的修改應控制在最小範圍，避免影響無關功能。

### 主題機制與新增方式

每個主題打包三件事並保持淺/深一致：正文（SCSS 以 CSS 變數驅動）、程式碼配色（highlight.js 主題）、Mermaid 圖表主題。

新增一個主題的步驟：

1. 在 `themes/` 建立 `<name>.scss`，以 `@use 'base'` 引入共用結構，並於 `:root` 設定調色盤變數（`--fg`、`--bg`、`--accent`、`--border`、`--quote-fg`、`--quote-border`、`--table-stripe`、`--inline-code-bg`）與 `color-scheme`。
2. 正文的 `--bg`/`--fg` 應對應該 highlight.js 主題的實際背景/前景色，讓程式碼區塊與正文同色系吻合。
3. 在 `src/themes.js` 的 `PRESETS` 登錄：`scss`（檔名）、`highlight`（hljs 主題名，字串為固定、物件 `{light,dark}` 為自動切換）、`mermaid`（`'default'`/`'dark'`，或 `'auto'` 依系統偏好）。
4. 同步更新 `README.md` 的〈內建主題〉表格與 `src/cli.js` 的 `--help`。

註：highlight.js 未提供官方淺色版的主題（如 Monokai、Dracula、Nord）僅提供深色，不硬湊淺色版以免配色不搭。

### 測試

以 Node 內建 `node:test` 撰寫，置於 `test/`。執行 `npm test`（內部為 `node --test "test/**/*.test.js"`，Node 的 `--test` 不接受目錄參數，須用 glob）。

### 版控

`examples/*.html` 與 `examples/*.assets/` 為可重新生成的輸出，已列入 `.gitignore`、不收錄於倉庫；要看效果請依 `README.md` 自行於本地生成。

## 標點符號規範

遵循全域規範：所有 Markdown 與原始碼（含註解）不得全半形標點混用；中文段落、句子中的冒號、逗號、分號、括號、句號一律全形；註解中每個段落的最後一句後面不加句號。
表格儲存格內僅用等寬的 ASCII 或中文字，不放 Emoji 或其他變寬字元以免破壞欄位對齊。

## 常用指令

```bash
npm install                                     # 安裝相依
node bin/tarmdas.js examples/sample.md          # 轉為自包含單檔
node bin/tarmdas.js examples/sample.md --watch  # Live Reload 開發伺服器
node bin/tarmdas.js --help                      # 完整選項
npm test                                        # 單元測試
```

## Commit 規範

1. 所有 commit message 一律使用繁體中文（台灣），並採用台灣標準翻譯與慣用術語，不得夾雜除必要訊息外的日語、韓語或其他非中文詞彙（包含感嘆句、慣用語）。
2. 使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/) 標準格式，以提高 commit message 的可讀性與可維護性。
3. 若變動較多、較為複雜，應在 commit 標題之外，列出至少一項 bullet point，說明本次異動的摘要，以及各個檔案的異動原因。
