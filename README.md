# 對話編碼輔助器

這是一個純前端的對話編碼工具，支援載入 Schema 與 Results 檔案（CSV/XLSX），進行逐則編碼、爭議標記、統計檢視與匯出結果。

目前專案已可透過 GitHub Pages 直接部署與存取。

## 專案結構

```text
dialog_coding_helper/
├─ index.html      # 頁面結構（HTML）
├─ styles.css      # 視覺樣式（CSS）
├─ script.js       # 互動邏輯（JavaScript）
└─ README.md
```

## 主要功能

- 匯入 `Schema`（編碼規範）與 `Results`（對話資料）
- 支援欄位映射（可對應不同資料欄位名稱）
- 逐則設定代碼、爭議標記
- 依群組檢視、篩選、刪除與復原對話群組
- Dashboard 統計（整體進度、爭議數、B/S tags）
- 匯出最終結果與已刪除資料（XLSX）
- 使用 IndexedDB 自動保存本機編碼進度

## 技術與外部資源

- UI：Tailwind CSS（CDN）
- 解析 CSV：PapaParse（CDN）
- 讀寫 Excel：SheetJS / XLSX（CDN）
- 本機儲存：瀏覽器 IndexedDB

## 使用方式

1. 開啟已部署的 GitHub Pages 網址（或本機直接開啟 `index.html`）。
2. 在「載入編碼規範 (Schema)」上傳規範檔案。
3. 在「載入對話資料 (Results)」上傳對話資料檔案。
4. 完成欄位映射後，進入編碼作業區進行標註。
5. 視需要切換至數據儀表板檢查進度與統計。
6. 完成後匯出結果檔案（XLSX）。

## 資料欄位建議

### Schema 建議欄位

- 代碼欄位（必填）：例如 `代碼`
- 名稱欄位：例如 `名稱`
- 說明欄位：例如 `說明`
- 角色欄位：例如 `角色`（可包含 `S` / `B`）

### Results 建議欄位

- 聊天室分組 ID（必填）：例如 `chatroom_id`
- 對話 ID（必填）：例如 `id`
- 發言角色（必填）：例如 `sender`（`bot` 或其他）
- 訊息內容（必填）：例如 `message`
- 既有代碼（選填）：例如 `code`
- 爭議標記（選填）：例如 `confusing`（`*` 代表爭議）

## GitHub Pages 更新建議流程

若已完成 GitHub Pages 設定，後續更新可用以下流程：

1. 修改 `index.html`、`styles.css`、`script.js` 或 `README.md`
2. 提交變更並 push 到部署分支（通常是 `main`）
3. 等待 GitHub Pages 重新部署完成
4. 重新整理網站確認最新版本

## 維護建議

- 若要新增 UI 樣式，優先放在 `styles.css`
- 若要新增行為或資料流程，統一放在 `script.js`
- `index.html` 盡量只保留頁面結構與外部資源引用
- 每次調整資料欄位邏輯，請同步更新本 README
