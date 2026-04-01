# 一番賞系統 v2 — 部署指南

## 📋 前置條件
- Google 帳號
- Google Sheets（`1ben31KoUoQn6U_XDzlk-AiR9FTHx2IXEQyqcuh_hhPg`）

## 🚀 部署步驟

### 第一步：設定 Google Apps Script
1. 打開 [Google Sheets](https://docs.google.com/spreadsheets/d/1ben31KoUoQn6U_XDzlk-AiR9FTHx2IXEQyqcuh_hhPg/edit)
2. 選單 **擴充功能** → **Apps Script**
3. 刪除預設程式碼，貼上 `apps-script.gs` 全部內容
4. 按 **儲存** (Ctrl+S)

### 第二步：部署為網路應用程式
1. 點選右上角 **部署** → **新增部署**
2. 齒輪 ⚙️ → **網路應用程式**
3. 設定：執行身分＝我自己、誰可存取＝所有人
4. **部署** → 授權 → 複製網址

### 第三步：前端設定
1. 在瀏覽器開啟 `index.html`
2. 貼上 Apps Script URL → 儲存

## 🔑 使用流程

### 活動建立者
1. 點「登入/註冊」→ 註冊帳號
2. 登入後點「新增活動」
3. 設定活動名稱 + 活動密碼 + 獎項
4. 分享活動密碼給參加者

### 參加者
1. 首頁看到活動 → 點擊 → 輸入活動密碼
2. 輸入名字 → 開始抽獎/刮刮樂
3. 一番賞：選擇獎券撕開
4. 刮刮樂：用滑鼠/手指刮開號碼

## ⚠️ 更新程式碼
修改 `apps-script.gs` 後：部署 → 管理部署 → ✏️ → 新版本 → 部署