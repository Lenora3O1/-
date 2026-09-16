# 社區交接清冊系統

給社區經理填寫「物業交接清冊」的前台表單，以及讓內勤人員查看紀錄、管理 Word 範本、
一鍵產生正式交接清冊 Word 檔的後台系統。

## 功能總覽

- **前台（社區經理）**：`/`，開啟就是動態產生的表單，依分類分區塊呈現題目，送出後存入資料庫。
- **後台（內勤人員）**：`/admin.html`，需登入。
  - **填答紀錄**：列表所有送出的清冊，可針對任一筆資料選擇範本，一鍵產生 Word 下載。
  - **Word 範本管理**：上傳 `.docx` 範本、設定預設範本、刪除範本。
  - **表單題目設定**：新增/修改/刪除/調整前台表單的題目，不用改程式碼。

## 版型設計方式（重點）

系統**不是**做一個網頁版的排版編輯器，而是讓內勤人員直接用最熟悉的 **Microsoft Word**
設計範本 —— 字型、顏色、行距、頁首頁尾、公司 Logo、簽名欄位置都在 Word 裡自由排版，
只要在要帶入資料的位置輸入 `{{欄位代碼}}`（雙大括號），系統就會自動把該筆填答資料套進去，
產生一份排版完整的正式 Word 文件。

- 欄位代碼請對照「表單題目設定」頁面裡每個題目的 `id`（例如 `community_name`、`handover_date`）。
- 專案內附上一份已經設計好、可直接使用或當作修改起點的範本：
  `sample-template/交接清冊範本-預設版.docx`
- 之後想換版型、加公司抬頭、換字型顏色，內勤人員只要複製一份範本用 Word 編輯、
  存檔後到「Word 範本管理」重新上傳、設為預設即可，完全不需要工程師介入。

## 安裝與啟動（開發環境）

需求：Node.js 18 以上版本。

```bash
cd handover-system
npm install
cp .env.example .env      # 複製並修改帳號密碼
npm start
```

啟動後：
- 前台表單：http://localhost:3000/
- 後台管理：http://localhost:3000/admin.html
  （預設帳密請見 `.env`，第一次上線請務必修改）

## 部署到正式伺服器（建議方式）

這是一個標準的 Node.js + Express 應用，資料庫用 SQLite（單一檔案 `data.sqlite`），
不需要額外的資料庫伺服器，因此有幾種常見部署方式：

### 方式一：自有主機 / VPS
1. 將整個專案上傳到伺服器（或用 git clone）。
2. `npm install --production`
3. 設定 `.env`（正式帳密、`SESSION_SECRET` 請用亂數字串）。
4. 用 `pm2` 常駐執行：
   ```bash
   npm install -g pm2
   pm2 start server.js --name handover-system
   pm2 save
   ```
5. 前面架一台 Nginx 反向代理到 `localhost:3000`，並申請 HTTPS 憑證（例如 Let's Encrypt / certbot）。
   內部系統務必要有 HTTPS，避免登入密碼被竊聽。

### 方式二：雲端 PaaS（如 Render、Railway、Zeabur 等）
- 這類平台通常會抹除容器內的檔案系統，SQLite 檔案、上傳的範本檔在重新部署後可能消失，
  建議掛載一個「持久化磁碟（Persistent Disk / Volume）」到專案根目錄（存放 `data.sqlite`
  和 `uploads/` 資料夾），或改用平台提供的 PostgreSQL（見下方「後續可強化項目」）。

### 資料備份
- 定期備份 `data.sqlite`（所有填答紀錄）與 `uploads/templates/`（所有範本檔）即可完整備份系統資料。

## 安全性注意事項

- 上線前務必：
  1. 修改 `.env` 裡的 `ADMIN_USER` / `ADMIN_PASS`。
  2. 修改 `SESSION_SECRET` 為隨機字串。
  3. 全站啟用 HTTPS。
- 目前後台是單一組帳號密碼，若內勤人員不只一人、需要各自登入或做權限區分，
  建議下一步把帳號改成存在資料庫裡的多組使用者（見下方）。

## 後續可強化項目（依需求選用）

- **多組後台帳號 / 權限分級**：目前是單一帳密，可擴充成資料庫使用者表 + 密碼雜湊（bcrypt）。
- **改用 PostgreSQL / MySQL**：資料量大、需要多台伺服器同時運作時，把 `db.js`
  換成對應的資料庫驅動即可，其餘程式邏輯不需大改。
- **檔案上傳的圖片附件**（例如交接時拍攝的現場照片），可以另外做一個附件上傳欄位，
  存檔後在 Word 範本裡用 docxtemplater 的圖片模組插入。
- **Email 通知**：送出表單後自動寄信通知內勤主管。
- **匯出 Excel 總表**：除了逐筆產生 Word，也可以增加「匯出全部紀錄成 Excel」的功能。

## 專案結構

```
handover-system/
├── server.js              # 主要伺服器與所有 API
├── db.js                  # SQLite 資料庫初始化
├── generate.js             # 套用範本產生 Word 檔的邏輯
├── config/questions.json   # 表單題目設定（也可透過後台介面編輯）
├── public/                 # 前台表單 + 後台管理頁面（純 HTML/CSS/JS）
│   ├── index.html / app.js       # 前台填表
│   ├── admin.html / admin.js     # 後台管理
│   └── styles.css
├── sample-template/         # 範例 Word 範本（含 {{欄位代碼}}）
├── uploads/templates/       # 使用者上傳的範本檔存放處
└── generated/               # （保留）產生檔案可暫存於此
```
