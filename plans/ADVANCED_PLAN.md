# Tarmdas 實作計畫

> 時間戳記：2026-06-03T21:04:12+08:00

## 背景與目標

Tarmdas 是一個本地、完全離線的 Markdown → 單一 HTML 轉換工具（非建站框架）。
目前專案目錄僅有 `PLAN.md`，需從零建立。
目標是一個輕量、腳本式的 Node.js CLI：預設「一次性轉檔、不啟動伺服器」，僅在使用者明確啟用 Live Reload 時才開最小化開發伺服器

依需求釐清的兩項關鍵設計決策：

1. **輸出形式**：預設「自包含單檔」（CSS／字型／JS／圖片全部內嵌），並提供外置資產模式；對體積過大的多媒體（影片等）採智慧降級為旁置資產，避免單檔爆量
2. **Mermaid**：採瀏覽器端渲染（內嵌 `mermaid.min.js`），不引入 Puppeteer，符合輕量原則

## 技術選型

優先使用 Node.js 內建能力，盡量減少依賴：

- CLI 參數：`node:util` 的 `parseArgs`（內建，免 commander）
- 檔案監看：`node:fs` 的 `watch`；開發伺服器用 `node:http`，Live Reload 用 SSE（免 ws 依賴）
- 模組系統：ESM（`"type": "module"`），對應 Node v26

核心依賴（皆輕量、離線）：

- `markdown-it` — Markdown 解析（外掛生態完整）
- `katex` + `@vscode/markdown-it-katex`（或 `markdown-it-texmath`）— LaTeX/KaTeX，建置期渲染為 HTML+CSS
- `highlight.js` — 程式碼語法高亮，建置期渲染
- `mermaid` — 僅用於取出 `mermaid.min.js` 內嵌，於瀏覽器端渲染

選用依賴（列為 `optionalDependencies`，僅在使用者提供對應檔案時才 lazy `import`）：

- `sass`（dart-sass 純 JS 版）— SCSS/SASS
- `less` — LESS

## 專案結構

```
tarmdas/
  package.json
  bin/tarmdas.js          # CLI 進入點（shebang）→ 呼叫 src/cli.js
  src/
    cli.js                # parseArgs、旗標解析、流程調度
    convert.js            # 核心管線（一次性轉檔）
    markdown.js           # markdown-it 實例 + 外掛（katex / highlight / mermaid fence）
    styles.js             # CSS/SCSS/SASS/LESS 編譯（lazy require sass/less）
    assets.js             # 資產解析與內嵌：KaTeX css+字型(base64)、mermaid js、hljs 主題、圖片/媒體
    template.js           # HTML 文件組裝
    watch.js              # 開發伺服器(node:http) + fs.watch + SSE Live Reload
    config.js             # 預設值與選用設定檔載入
  assets/                 # 隨附離線資產（或從 node_modules 解析）
  examples/sample.md      # 涵蓋全功能的示範輸入
  test/                   # node:test 單元測試
```

## 核心管線（src/convert.js）

1. 讀取 Markdown 原始檔，解析 front-matter（選用，供 title 等）
2. 以 `src/markdown.js` 的 markdown-it 實例渲染為 HTML 片段：
   - 程式碼區塊 → highlight.js 建置期高亮
   - `$...$` / `$$...$$` → KaTeX 建置期渲染
   - ` ```mermaid ` fence → 轉為 `<pre class="mermaid">原始碼</pre>`（交由瀏覽器端渲染）
3. 以 `src/styles.js` 編譯使用者 CSS（依副檔名選 sass/less/原生 css）
4. 以 `src/assets.js` 處理本地資產（見下節）
5. 以 `src/template.js` 組裝完整 HTML 文件並寫出

## 資產與多媒體處理（src/assets.js）— 關鍵

- **向量資產（必內嵌以維持離線）**：KaTeX CSS 並將其 `url()` 字型改寫為 base64 data URI（從 `katex/dist/fonts` 讀取 woff2）、所選 highlight.js 主題 CSS、`mermaid.min.js` + 初始化腳本、使用者 CSS
- **本地圖片/媒體**：掃描渲染後 HTML 的 `<img src>`、`<video>/<audio>` 來源、本地 `<a href>`，以 Markdown 檔所在目錄解析相對路徑
  - 內嵌機制：讀取檔案二進位內容 → Base64 編碼 → 依副檔名決定 MIME type（`image/png`、`image/jpeg`、`image/svg+xml`…）→ 組成 `data:<mime>;base64,...` 的 data URI 寫入 `src`。瀏覽器原生支援，無外部請求、可 `file://` 離線開啟
  - SVG 特例：不走 Base64，直接內聯為 `<svg>...</svg>` 標籤，體積更小、亦可被 CSS 樣式化
  - 門檻設計理由：Base64 會使資料膨脹約 33%（每 3 bytes → 4 字元）且無法被瀏覽器單獨快取，因此採大小分流而非無條件內嵌——`--max-inline-size` 預設 **5 MB**
  - 自包含模式（預設）：大小 ≤ `--max-inline-size` → Base64 data URI 內嵌；超過門檻（典型如影片）→ 複製到旁置 `<輸出名>.assets/` 並改寫路徑（單檔模式下的智慧降級，避免單檔爆量）
  - 外置資產模式（`--external-assets`）：一律複製到旁置資產資料夾並改寫路徑
  - 遠端 URL（http/https）保持原樣，不下載

## HTML 組裝（src/template.js）

- 標準 HTML5 骨架；`<head>` 內嵌所有 CSS、`<body>` 末端內嵌 mermaid JS + 初始化
- 內建一份簡潔預設文件樣式（可被使用者 CSS 覆蓋）
- Live Reload 用的 SSE 客戶端腳本「僅在 watch 模式」注入，一次性轉檔的產物保持乾淨

## Live Reload（src/watch.js）

- `--watch` / `--serve [port]` 啟用時：以 `node:http` 起最小伺服器供出產物，`node:fs.watch` 監看 Markdown 與 CSS 來源
- 變更時於記憶體重跑管線，透過 SSE 推送 `reload` 事件給瀏覽器；注入的客戶端腳本收到後 `location.reload()`
- 預設路徑（無此旗標）完全不啟動伺服器，符合「不為轉一個檔而起完整伺服器」的要求

## CLI 介面（src/cli.js）

```
tarmdas <input.md> [options]
  -o, --output <file>        輸出 HTML 路徑（預設同名 .html）
      --css <file...>        自訂樣式（.css/.scss/.sass/.less）
      --external-assets      改用 HTML + 旁置資產資料夾
      --max-inline-size <n>  單檔模式媒體內嵌門檻位元組（預設 ~5MB）
      --watch | --serve [p]  啟用 Live Reload 開發伺服器
      --theme <name>         highlight.js 主題
      --title <text>         文件標題（預設取 front-matter 或 H1）
      --no-mermaid | --no-math | --no-highlight
                             功能開關
      --config <file>        選用設定檔
  -h, --help / --version
```

## 實作順序（建議分階段）

1. 專案骨架：`package.json`（ESM、bin、scripts）、`bin/tarmdas.js`、`src/cli.js` 最小可跑（讀檔→空 markdown-it→寫出）
2. Markdown 核心 + highlight.js + KaTeX（`src/markdown.js`、`template.js`）
3. 自訂 CSS 與 SCSS/LESS 編譯（`src/styles.js`）
4. 資產內嵌與多媒體智慧降級（`src/assets.js`）、`--external-assets`
5. Mermaid 內嵌（瀏覽器端渲染）
6. Live Reload（`src/watch.js`）
7. 示範檔 `examples/sample.md` 與 `test/` 單元測試

## 驗證方式

- 建立 `examples/sample.md`，涵蓋：標題/清單/表格、程式碼區塊（多語言）、行內與區塊數學、Mermaid 圖、本地圖片、（選擇性）影片
- `node bin/tarmdas.js examples/sample.md -o out.html`，以瀏覽器用 `file://` 開啟 `out.html`，逐項確認：高亮、數學、Mermaid 圖、圖片內嵌皆離線正常顯示（可斷網驗證）
- 自訂 CSS 驗證：`--css theme.scss` 確認 SCSS 編譯並套用
- 外置資產：`--external-assets` 確認產生 `out.assets/` 且路徑正確；大影片在單檔模式下確認降級為旁置
- Live Reload：`--watch` 開啟後修改 `sample.md`，確認瀏覽器自動刷新
- `node --test test/` 跑單元測試（管線、資產內嵌門檻、樣式編譯分支）

## 與需求對照

| 需求                      | 對應方案                                   |
| ------------------------- | ------------------------------------------ |
| 本地離線                  | 全部資產內嵌；不抓遠端資源                 |
| 單檔輸出                  | 預設自包含單檔；多媒體智慧降級             |
| 自訂 CSS + SASS/SCSS/LESS | src/styles.js，sass/less 列選用依賴        |
| Mermaid 離線              | 內嵌 mermaid.min.js 瀏覽器端渲染           |
| LaTeX/KaTeX               | KaTeX 建置期渲染 + 字型 base64 內嵌        |
| Live Reload 可選          | 預設不起伺服器，--watch 才啟用 SSE         |
| 輕量腳本式                | 內建 parseArgs/http/fs；最小依賴；無重框架 |
| Node.js                   | ESM、Node v26                              |
