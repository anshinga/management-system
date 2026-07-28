# MPM 點名系統

網站由 GitHub Pages 直接發布；Firebase Authentication 與 Cloud Firestore 只負責登入、權限與雲端資料同步。

## 架構

- GitHub Pages 直接讀取專案根目錄的 `index.html`、`css/` 與 `js/`，不需要 Vite 或 production build。
- `index.html` 透過 Firebase 官方 CDN import map 載入 Firebase Web SDK。
- Google Authentication 負責登入；實際資料權限由 `workspaces/mpm-main/members` 與 Firestore Security Rules 共同決定。
- `students`、`seasons`、`scheduleEntries`、`scheduleOverrides`、`attendance`、`billingCycles`、`payments` 分開保存，介面透過 Firestore 即時監聽同步。
- 第 24 堂點名會在同一個 transaction 內推進學生期數並建立待付款期別；付款 transaction 會新增不可修改的付款歷史並結清期別。
- `localStorage` 只保存深色模式與目前選取的點名日期，不保存業務資料。
- Firebase 專案為 `denmin-b0a26`，預設工作區為 `mpm-main`。

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
