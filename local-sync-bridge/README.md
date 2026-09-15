# BNI 本機同步橋接器

這個工具讓管理網站送出更新請求後，由本機已驗證的 BNI 工作階段執行抓取，不需要 Chrome 擴充套件，也不需要先開啟 Connect 頁面。

目前第一階段會更新在籍會員與個人 KPI。出缺席與續約報告會沿用網站既有資料，待第二階段報表解析完成後納入同一按鈕。

1. 將 `settings.example.json` 複製為 `settings.json`。
2. 在管理網站產生同步金鑰並貼入 `settings.json`。
3. 執行 `py -m pip install -r requirements.txt`。
4. 雙擊 `啟動同步工具.bat`，保持視窗執行。
5. 回管理網站按「一鍵更新會員與 PALMS」。

`settings.json`、BNI 帳密與 `storage_state.json` 均不會進入 Git。
