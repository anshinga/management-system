# 安信佳點名系統

網站由 GitHub Pages 直接發布；Firebase Authentication 與 Cloud Firestore 只負責登入、權限與雲端資料同步。

登入頁、主系統與家長選課頁使用安信佳標誌；瀏覽器 favicon 與 iOS 主畫面圖示使用大嘴鳥。品牌圖檔集中於 `assets/branding/`，不影響既有 `mpm-main` 工作區或匯出表中的 MPM 名稱。

## 架構

- GitHub Pages 直接讀取專案根目錄的 `index.html`、`css/` 與 `js/`，不需要 Vite 或 production build。
- `index.html` 透過 Firebase 官方 CDN import map 載入 Firebase Web SDK。
- Google Authentication 負責登入；實際資料權限由 `workspaces/mpm-main/members` 與 Firestore Security Rules 共同決定。
- `students`、`seasons`、`scheduleEntries`、`scheduleOverrides`、`attendance`、`leaveRecords`、`billingCycles`、`payments` 分開保存，介面透過 Firestore 即時監聽同步。
- 完成第 20 堂時會在同一個 transaction 內建立繳費提醒；第 24 堂只推進學生期數。確認已繳費後會解除提醒，不再要求輸入金額、方式或備註。
- 若誤點的最新紀錄剛好是第 24 堂，可安全撤銷並自動恢復原期別第 23 堂；已有下一期點名時仍必須由最新紀錄開始依序撤銷。
- 「數據統計與分析」進頁時不讀取歷史點名；只有按下分析按鈕後，才會一次性查詢最近 4、8 或 13 週的日期範圍。
- 「匯出備份」會以唯讀方式從排課資料產生下一週紙本點名表，不會建立或修改 Firestore 文件。
- `localStorage` 只保存深色模式、目前選取的點名日期與最後使用日期，不保存業務資料。
- Firebase 專案為 `denmin-b0a26`，預設工作區為 `mpm-main`。

## 數據統計與分析

- 管理端頁籤提供最近 4、8、13 週的每週總人次、各時段人次與「週次 × 時段」明細。
- 預設最近 8 週，每週從星期一開始；目前週會標示為「進行中」。
- 只統計目前狀態為 `active` 的學生與實際存在的 `attendance`，同一學生同一天上兩堂會計為 2 人次。
- 不分析個別學生，也不計算平均週人次、出席率、請假率或缺席率。
- 進入頁面只使用既有的學生基礎訂閱，不會自動訂閱 `attendance`；按下「開始分析」後才執行有日期上下限的單次查詢。
- 單次查詢最多 13 週，相同範圍在本次登入期間使用記憶體快取；「重新分析」會重新讀取最新資料。
- owner、teacher、viewer 沿用既有工作區讀取權限，不需要新增 Firestore Rules、Indexes 或 Cloud Functions。

## GitHub Pages 發布

一般介面或功能修改只需要依原有 GitHub 流程 commit、push，並合併到 GitHub Pages 使用的分支。GitHub Pages 會直接發布根目錄，不需要執行 `npm run build` 或 `firebase deploy`。

若 Google 登入顯示 `auth/unauthorized-domain`，請在 Firebase Console 的 Authentication 設定中，將 `anshinga.github.io` 加入 Authorized domains。

## 測試

只有執行自動測試時才需要安裝 npm 套件：

```powershell
npm.cmd install
npm.cmd test
npm.cmd run test:rules
```

`test:rules` 會透過本機 Firestore Emulator 驗證 Security Rules，不會連線或寫入正式資料庫。

## Firebase 後端設定

一般前端功能修改不需要部署 Firebase。只有變更 `firestore.rules` 或 `firestore.indexes.json` 時，才需要：

```powershell
npx.cmd firebase login
npx.cmd firebase deploy --only firestore
```

不要重新執行 `firebase init hosting`，也不要將 Service Account JSON、Token 或其他秘密資料加入版本控制。前端的 `firebaseConfig` 是 Firebase Web App 的公開識別設定，安全性仍以 Authentication 與 Security Rules 為準。

## 家長選課活動

管理端的「選課活動」可建立固定週時段登記，發布時會為每位在籍學生產生專屬連結與 QR Code。家長在 `booking.html` 送出後，可信任的 Cloud Functions 會以交易檢查名額，並把整段期間的固定時段寫入 `scheduleEntries`。

新增的 Firestore 集合如下：

- `bookingCampaigns`：活動設定與狀態。
- `bookingInvitations`：每位學生的私密代碼與填寫狀態。
- `bookingSubmissions`：已確認的時段與本次建立的排課文件。
- `bookingSlotCounters`：發布當下既有排課與後續登記名額。

家長頁面不具有 Firestore 寫入權限；公開讀取與送出皆透過位於 `asia-east1` 的 callable functions。第一次上線前必須同時部署 Functions 與 Firestore Rules：

```powershell
npm.cmd install
cd functions
npm.cmd install
cd ..
npx.cmd firebase deploy --only functions,firestore
```

GitHub Pages 仍照原本流程發布 `index.html`、`booking.html`、`css/` 與 `js/`。若只更新 GitHub Pages、未部署 Functions 與 Rules，選課連結將無法讀取或送出。

活動開放時會以當下既有排課計算可登記名額。為避免名額計數與實際排課不同，活動開放期間不要再人工增減該活動的日期與時段；如需調整，應先提前截止活動。

## 繳費提醒

- 學生完成每一期第 20 堂後建立待繳費提醒。
- 待確認學生在今日點名頁以紅色姓名顯示。
- 「繳費」頁只提供提醒名單與一次性的「已繳費」確認。
- 確認後記錄提醒期別與 `paidAt`，並立即解除紅字提醒。
- 舊有 `payments` 付款歷史保留但不再顯示或新增，避免破壞既有資料。
- 未來可由 LINE Bot 讀取待處理的 `billingCycles`；目前尚未實作 LINE 串接。

## 請假

- 今日點名的未到班學生可選擇「到班」或「請假」，請假後可再取消。
- 請假以獨立的 `leaveRecords` 文件保存，不建立 `attendance`，因此不增加堂數、不推進期數，也不觸發繳費提醒。
- 同一學生同一天不同時段分開判斷；請假中的時段會鎖定，必須先取消請假才能拖曳或改為到班。
- 排課頁會以刪除線姓名、虛線框與「請假」標籤呈現，但排課格不會因此變成已到班的綠色狀態。
- 發布包含此功能的 GitHub Pages 版本前，必須先發布相容的 `firestore.rules`，否則新集合無法讀取。

## 匯出備份

- 管理端可手動切換週次，預設顯示下一週。
- 可下載固定版型的 Word `.docx`，或開啟瀏覽器列印並另存 PDF。
- 學生姓名右側保留空白註記欄；停課學生不會出現在新備份中。
- 同一位學生同日排兩堂會保留兩筆；目標週既有的臨時排課也會納入。
- 平日 15:00、16:30 每時段單頁 8 人，18:00、19:30 每時段單頁 10 人；週六上午依版型分為 8 人與 10 人。原時段超過容量時，多出的學生會依序補到同一天的下一個時段；後續時段全滿才增加續頁，絕不移到其他日期或省略學生。
- Word 範本位於 `assets/templates/mpm-weekly-backup-template.docx`；產生檔案時只填入年份、月份、日期與姓名。
- 目前只提供手動匯出；每週日自動產生的計畫暫時擱置。
- 「課程紀錄表」可選擇雙月紀錄資料夾，依年級與姓名排序匯出所有在讀學生；停課學生不會匯出。
- 每位學生會先保留期間開始前最後一堂，再接上所選期間內全部已完成課程；期間內沒有上課者仍會保留一列，從未上課者則為空白列。
- 每格代表一堂課並以 `月/日，堂數` 顯示，例如 `7/22，18`；同日兩堂會保留兩格。每列最多 15 堂，超過時以同一學生的「(續)」列接續。
- 課程紀錄表同樣提供 Word 與列印／另存 PDF；Word 範本位於 `assets/templates/mpm-records-backup-template.docx`。
- 兩種匯出都只讀取既有資料，不會寫入 Firestore，也不需要新增 Rules 或索引。
