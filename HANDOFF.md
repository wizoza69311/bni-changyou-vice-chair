# BNI 長佑分會副主席管理系統｜交接文件

## 專案定位

此系統協助副主席與委員處理每週會議議程、來賓追蹤、會員續約、委員待辦、會議建檔、出缺席管理、分組管理及會員主檔。會員主檔對所有使用者開放唯讀檢視；分組管理、KPI 維護、PALMS 同步與具破壞性的管理操作僅限系統擁有者。

正式網站：<https://bni-changyou-vice-chair.wizoza69311.chatgpt.site/>

日常工作分流與兩台電腦同步方式請見 [`docs/WORKFLOW.md`](docs/WORKFLOW.md)。

## 技術架構

- Node.js 22+
- React 19、Next.js 16、Vinext、Vite
- Cloudflare Worker 相容的伺服器入口：`worker/index.ts`
- Cloudflare D1／Drizzle：`db/`、`drizzle/`
- Sites 部署設定：`.openai/hosting.json`
- Chrome PALMS 同步工具：`public/bni-sync-extension/`

## 本機啟動

```bash
npm install
npm run dev
```

檢查與建置：

```bash
npm run build
npm run lint
```

若修改 Drizzle schema：

```bash
npm run db:generate
```

## 主要資料與功能

- `/api/practice`：續約、委員待辦、來賓追蹤
- `/api/weekly-archives`：每週會議獨立建檔
- `/api/quality-cases`：A 信、B 信與關懷案件
- `/api/attendance-records`：PALMS 出席紀錄
- `/api/member-groups`：12 組分組資料
- `/api/member-care-owners`：分組與關懷負責人連動
- `/api/v1/groups`、`/api/v1/members/:name/group`：分組 API
- `/api/v1/bni-sync`：瀏覽器工具同步 PALMS
- `/api/weekly-palms`：管理員檢視已完成例會的來賓、引薦單、PALMS 交易價值與審計篩選金額
- `/api/weekly-palms/reviews`：管理員逐筆標記本會交易的人工查核狀態與備註
- `/api/admin-status`：目前使用者的擁有者與授權管理員權限狀態

## 部署環境變數

實際值只應設定於 Sites 的加密環境變數，禁止提交到 Git。程式會使用下列名稱：

- `ADMIN_EMAIL`
- `ADMIN_EMAILS`：以逗號分隔的授權管理員信箱；可使用系統後臺一鍵更新與分組管理，擁有者專用的刪除與金鑰設定仍只看 `ADMIN_EMAIL`
- `GROUPS_API_KEY`
- `GROUPS_READ_API_KEY`
- `BNI_TOKEN_ENCRYPTION_KEY`
- `ZOOM_ACCOUNT_ID`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `OPENAI_API_KEY`

## BNI Connect／PALMS

目前網站後臺的一鍵更新會呼叫 `sync-service/` 雲端同步器，在登入後的瀏覽器工作階段讀取 BNI Connect；原有 Chrome 擴充工具保留作為備援。擴充工具流程如下：

1. 管理員在會員主檔產生一次性同步配對金鑰。
2. 使用者登入 BNI Connect 後，由擴充工具在瀏覽器工作階段讀取報表。
3. 只上傳會員姓名、例會日期及 `P/A/L/M/S`，不傳送 BNI 帳密或 Token。
4. 新配對金鑰產生後，舊金鑰立即失效。

目前統計採包含當月的連續六個月；每兩次遲到折算一次缺席，偶數次遲到在矩陣顯示為 `L/A`。

雲端同步器也從最近已完成的分會 PALMS 逐週擷取「提供內部／外部引薦、來賓、交易價值」，並嘗試讀取同週審計報告。審計交易僅將「詳細資料」未標註其他分會者列入本會交易；審計明細總額與 PALMS 總額不一致或讀取失敗時，頁面會明確顯示待核對，不會冒充已驗證。個別交易的人工勾選紀錄另存，不受再次同步覆蓋。

## 權限與個資

- 網站是公開網址，但管理畫面使用 ChatGPT 擁有者登入判斷。
- Repository 必須維持 Private。
- 原始碼含會員姓名與分組業務資料，視為內部個資，不可轉為公開 repository。
- PALMS 匯出 JSON、部署封裝、`.env*`、本機資料庫與 Token 均已由 `.gitignore` 排除。
- 不要把 Access Token、Refresh Token、API Key 或任何 BNI 登入資訊寫入 issue、commit、README 或程式碼。

## 已知限制與下一步

- Chrome PALMS 同步工具需要在新環境手動載入未封裝擴充功能。
- BNI Connect 內部 API 不是正式公開 API，端點或報表格式改版時需同步調整解析器。
- 自動排程仍受瀏覽器是否登入 BNI Connect 影響；建議保留手動同步與資料完整度預覽。
- 會員在籍名單目前仍有程式內白名單，後續應移至 D1 並加入管理介面。
- 變更出缺席資料前必須保留同步前預覽及多人更新衝突保護。

## 發布注意事項

1. 確認 `npm run build` 成功。
2. 確認沒有把 `.env`、PALMS 匯出檔或部署封裝加入 Git。
3. 透過 Sites 儲存版本並部署既有 `project_id`，不要建立重複站台。
4. 發布後以一般使用者確認會員主檔與 KPI 可唯讀檢視，再以擁有者帳號驗證分組管理、KPI 維護與 PALMS 同步入口。

