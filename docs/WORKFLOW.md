# BNI 與副主席管理系統工作流

## 工作區分流

| 類型 | 使用位置 | 用途 |
| --- | --- | --- |
| BNI 討論、制度、活動、文案與參考文件 | ChatGPT Project「BNI」 | 長期知識、聊天與專案來源 |
| 分會經營管理主題 | ChatGPT Project「BNI｜分會經營管理」 | 分會制度與管理討論；尚未合併，以免遺失既有脈絡 |
| 副主席管理系統程式碼 | 本資料夾與 GitHub repository | Codex 開發、測試與版本控制 |
| 大型簡報、Word、Excel 與原始素材 | BNI 文件資料夾或 ChatGPT Project | 不納入本程式碼 repository，除非程式執行確實需要 |

## 唯一程式碼位置

本機：`C:\Users\葉\OneDrive\文件\BNI\vice-chair-practice`

GitHub：`https://github.com/wizoza69311/bni-changyou-vice-chair`

主要遠端分支：`origin/main`。目前這台電腦使用本機分支 `github-main` 追蹤 `origin/main`；不要把外層 `BNI` repository 當成副主席系統的同步來源。

## 兩台電腦同步標準流程

每台電腦都各自 clone GitHub repository 到獨立資料夾。不要用 OneDrive 同步 `.git` 或同一份工作目錄，也不要同時在兩台電腦編輯同一個未提交版本。

開始工作前：

```bash
git status
git pull --ff-only origin main
```

完成一個可辨識的小階段後：

```bash
git add <本次修改的檔案>
git commit -m "簡短說明本次變更"
git push origin HEAD:main
```

換到另一台電腦前，先確認前一台已 push；新電腦開始時再 pull。若 `git status` 顯示未提交內容，先保留並確認用途，不要強制覆蓋。

## 資料保護原則

- Repository 維持 Private。
- `.env*`、API Key、Token、本機資料庫、PALMS 匯出資料與部署封裝不得提交。
- 會員姓名、出席與分組資料視為內部資料，只保留系統運作所需的最小範圍。
- 對不確定用途的檔案先保留並標記，不刪除、不移動、不覆蓋。

## 目前已知的外層資料夾狀況

外層 `C:\Users\葉\OneDrive\文件\BNI` 自己也是另一個 Git repository，遠端為 `bni-changyou-minutes`，並包含許多未追蹤的 BNI 文件與本程式資料夾。此結構容易混淆，但現階段不移動或刪除，以免破壞既有資料。

後續整理時，建議把兩個 repository 放成平行資料夾，而非互相巢狀；此動作應在兩邊都已推送並備份後，另行執行。
