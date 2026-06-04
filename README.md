# Tarmdas

本地、完全離線的 Markdown → 單一 HTML 轉換工具

專案名稱取自作者的精靈語名字 _Taras_，內嵌 _md_（Markdown 的縮寫）

## 這是什麼

Tarmdas 把單一 Markdown 檔轉成單一、可離線開啟的 HTML 檔——不是建站框架，也不需要為了轉一個檔而啟動完整伺服器。
預設產出「自包含單檔」：CSS、字型、Mermaid 腳本、圖片全部內嵌，複製到任何地方用瀏覽器 `file://` 直接開啟即可，無需網路

### 特色

- **完全離線**：所有資產內嵌，不抓取任何遠端資源
- **單一檔案**：預設自包含單檔；影片等超過門檻的大型媒體會自動降級為旁置資產，避免單檔爆量
- **LaTeX / KaTeX**：建置期渲染數學，字型以 base64 內嵌
- **Mermaid**：內嵌腳本於瀏覽器端渲染，不依賴 Puppeteer
- **程式碼高亮**：highlight.js 建置期高亮
- **GitHub Alerts**：支援 `> [!NOTE]`、`> [!IMPORTANT]` 等五種警示區塊，標記與配色與 GitHub 一致，並依主題淺/深自動切換
- **內建主題**：GitHub、One、Gruvbox、Tokyo Night、Solarized、Monokai、Dracula、Nord 等共 14 種（多數含淺/深），正文、程式碼、Mermaid 三處配色一致
- **自訂樣式**：支援 CSS 與 SASS / SCSS / LESS 預處理
- **Live Reload**：可選擇性啟用；預設不啟動任何伺服器
- **輕量**：CLI、開發伺服器、檔案監看皆使用 Node.js 內建能力，無重量級框架

## 安裝

需要 Node.js 20 以上

```bash
npm install
```

## 使用範例

以隨附的 [`examples/sample.md`](examples/sample.md)（涵蓋文字、表格、程式碼、KaTeX、Mermaid、圖片）為例：

```bash
# 轉為自包含單檔（預設輸出 examples/sample.html）
node bin/tarmdas.js examples/sample.md

# 指定輸出路徑
node bin/tarmdas.js examples/sample.md -o dist/sample.html

# 選擇內建主題（github 自動 / github-light / github-dark）
node bin/tarmdas.js examples/sample.md --theme github-dark

# 淺色版面搭配深色程式碼配色
node bin/tarmdas.js examples/sample.md --theme github-light --highlight-theme github-dark

# 套用自訂 SCSS 樣式
node bin/tarmdas.js examples/sample.md --css my-theme.scss

# 改用「HTML + 旁置資產夾」模式
node bin/tarmdas.js examples/sample.md --external-assets

# 啟用 Live Reload（修改後瀏覽器自動刷新）
node bin/tarmdas.js examples/sample.md --watch
```

啟用 `--watch` 後開啟終端機顯示的網址（預設 `http://localhost:4321/`），編輯 `examples/sample.md` 存檔即會自動重新整理

### 預覽輸出

上述指令會在本機產生 HTML 檔。為避免龐大的自包含檔（每個約 3.6 MB）進入版控，輸出的 `examples/*.html` 已列入 `.gitignore`、不收錄於倉庫；想看實際效果，請自行執行對應指令在本地生成，例如：

```bash
# 自包含單檔，依情境加後綴區別
node bin/tarmdas.js examples/sample.md -o examples/sample-github-auto.html
node bin/tarmdas.js examples/sample.md -o examples/sample-github-light.html --theme github-light
node bin/tarmdas.js examples/sample.md -o examples/sample-github-dark.html --theme github-dark
node bin/tarmdas.js examples/sample.md -o examples/sample-light-darkcode.html --theme github-light --highlight-theme github-dark
node bin/tarmdas.js examples/sample.md -o examples/sample-external.html --external-assets
```

## 指令選項

| 選項                       | 說明                                                      |
| -------------------------- | --------------------------------------------------------- |
| `-o, --output <file>`      | 輸出 HTML 路徑（預設：同名 .html）                        |
| `--css <file>`             | 自訂樣式檔（.css/.scss/.sass/.less），可重複指定          |
| `--external-assets`        | 改用「HTML + 旁置資產夾」模式                             |
| `--max-inline-size <n>`    | inline 模式媒體內嵌上限，支援 k/m/g 後綴（預設 5m）       |
| `--theme <name>`           | 文件主題，共 14 種（預設 github，完整清單見〈內建主題〉） |
| `--highlight-theme <name>` | 覆寫程式碼配色（任一 highlight.js 主題）                  |
| `--title <text>`           | 文件標題（預設取 front-matter 或首個 H1）                 |
| `--breaks`                 | 段落內單一換行渲染為 `<br>`（預設視為空格）               |
| `--no-math`                | 停用 KaTeX                                                |
| `--no-mermaid`             | 停用 Mermaid                                              |
| `--no-highlight`           | 停用程式碼高亮                                            |
| `-w, --watch`              | 啟用 Live Reload 開發伺服器                               |
| `--port <n>`               | 開發伺服器埠號（預設 4321）                               |
| `-h, --help`               | 顯示說明                                                  |
| `-v, --version`            | 顯示版本                                                  |

## 內建主題

共 14 種：

| 主題                | 正文                  | 程式碼（highlight.js）      | Mermaid        |
| ------------------- | --------------------- | --------------------------- | -------------- |
| `github`（預設）    | 跟隨系統淺/深自動切換 | 自動切換                    | 依系統偏好選色 |
| `github-light`      | 淺色                  | github                      | default        |
| `github-dark`       | 深色                  | github-dark                 | dark           |
| `one-light`         | 淺色                  | atom-one-light              | default        |
| `one-dark`          | 深色                  | atom-one-dark               | dark           |
| `gruvbox-light`     | 淺色                  | base16/gruvbox-light-medium | default        |
| `gruvbox-dark`      | 深色                  | base16/gruvbox-dark-medium  | dark           |
| `tokyo-night-light` | 淺色                  | tokyo-night-light           | default        |
| `tokyo-night-dark`  | 深色                  | tokyo-night-dark            | dark           |
| `solarized-light`   | 淺色                  | base16/solarized-light      | default        |
| `solarized-dark`    | 深色                  | base16/solarized-dark       | dark           |
| `monokai`           | 深色                  | monokai                     | dark           |
| `dracula`           | 深色                  | base16/dracula              | dark           |
| `nord`              | 深色                  | nord                        | dark           |

每個主題以 CSS 變數驅動正文，並連動對應的 highlight.js 程式碼配色與 Mermaid 圖表主題，使三者淺/深一致。主題以 SCSS 撰寫，放在 [`themes/`](themes/)，可作為自訂主題的範本

> Monokai、Dracula、Nord 因 highlight.js 未提供官方淺色版而僅有深色

## 技術棧

| 範疇                | 採用                                         |
| ------------------- | -------------------------------------------- |
| 執行環境            | Node.js（ESM）                               |
| Markdown 解析       | markdown-it                                  |
| 數學                | KaTeX + markdown-it-texmath                  |
| 程式碼高亮          | highlight.js                                 |
| 圖表                | Mermaid（瀏覽器端渲染）                      |
| 樣式預處理          | sass（dart-sass）；less 為選用               |
| CLI / 伺服器 / 監看 | Node.js 內建 parseArgs、http、fs.watch + SSE |

## 運作方式

1. 讀取 Markdown，解析 front-matter
2. 以 markdown-it 渲染為 HTML；程式碼經 highlight.js、數學經 KaTeX、Mermaid 區塊轉為 `<pre class="mermaid">`
3. 處理本地圖片/媒體：小於門檻者以 Base64 內嵌（SVG 內聯），超過門檻或外置模式則複製到旁置資產夾
4. 按需內嵌所需資產：只有文件實際用到時，才納入對應的主題、KaTeX、Mermaid 等資源，讓簡單文件維持輕巧
5. 組裝為完整 HTML 並寫出

## 開發

```bash
npm test   # 執行單元測試（node:test）
```

## 授權

本專案採 MIT 授權，詳見 [LICENSE](LICENSE)
