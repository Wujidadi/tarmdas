# Markdown to HTML Converter - 計畫規劃

> 時間戳記：2026-06-03T20:48:00+08:00

專案名稱定為 "Tarmdas"，取我的精靈語名字 "Taras" 內嵌 "md"（Markdown 的縮寫）

## 需求清單

- 本地執行，完全離線
- 單一 Markdown 檔案 → 單一 HTML 檔案（不是建站框架）
- 支援自訂 CSS（含 SASS / SCSS / LESS 預處理）
- 支援 Mermaid 離線渲染
- 支援 LaTeX / KaTeX
- Live Reload（修改 Markdown 後自動更新瀏覽器），可選擇性啟用
- 輕量、腳本式工具，不過度複雜，不要依賴龐大框架，或為了轉換一個 Markdown 檔案而啟動一個完整的伺服器
- 使用 Node.js 實作
- 效能不是最大考量，但也不要太差
