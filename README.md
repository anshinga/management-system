# MPM 點名系統

以 Firebase Authentication、Cloud Firestore 與 Firebase Hosting 建置的課程管理系統。

## 架構

- Google Authentication 負責登入；實際資料權限由 `workspaces/mpm-main/members` 與 Firestore Security Rules 共同決定。
- `students`、`seasons`、`scheduleEntries`、`scheduleOverrides`、`attendance`、`billingCycles`、`payments` 分開保存，介面透過 Firestore 即時監聽同步。
- 第 24 堂點名會在同一個 transaction 內推進學生期數並建立待付款期別；付款 transaction 會新增不可修改的付款歷史並結清期別。
- `localStorage` 只保存深色模式與目前選取的點名日期，不保存業務資料。
- 正式 Firebase 專案為 `denmin-b0a26`，預設工作區為 `mpm-main`。

## 本機開發

```powershell
npm.cmd install
npm.cmd run dev
```

若要使用完全隔離的本機 Firebase：

```powershell
$env:VITE_USE_FIREBASE_EMULATORS="true"
npm.cmd run emulators
npm.cmd run dev
```

開發模式只有在 `VITE_USE_FIREBASE_EMULATORS=true` 時才會連線至 Auth 與 Firestore Emulator；production build 永遠使用正式 Firebase 設定。

## 驗證

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:rules
```

`test:rules` 會透過 Firebase Emulator 執行 Firestore Security Rules 測試，不會連線至正式資料庫。

## 部署

完成測試、確認 Firebase 專案與登入帳號後：

```powershell
npm.cmd run build
npx.cmd firebase login
npx.cmd firebase deploy
```

部署會同時更新 Hosting、Firestore Rules 與 indexes。不要將 Service Account JSON、Token 或其他秘密資料加入版本控制；前端的 `firebaseConfig` 是 Firebase Web App 的公開識別設定，安全性仍以 Authentication 與 Security Rules 為準。
