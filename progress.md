# MPM 點名系統：專案進度與交接

> 最後更新：2026-07-30  
> 更新時的分支：`main`  
> 更新前的 Git HEAD：`451c9b9`（學生管理手機介面）

這份文件提供給後續的新對話或開發者快速接手。開始修改前，仍必須先完整閱讀 `AGENTS.md`，並以使用者最新指示為準。

## 新對話的建議開始方式

依序進行：

1. 閱讀 `AGENTS.md`。
2. 閱讀本文件 `progress.md`。
3. 閱讀 `README.md`。
4. 執行 `git status --short` 與 `git log --oneline -10`。
5. 先理解相關 view、domain、repository 與測試，再提出修改方案。
6. 未取得使用者同意前，不進行高風險、資料結構或產品行為變更。

可直接在新對話使用以下提示：

> 請先完整閱讀 AGENTS.md、progress.md、README.md，以及最近 10 筆 Git commit。先理解目前功能、資料結構與尚未完成事項，不要立即修改檔案；確認後再接續開發。

## 目前檢查點

- 本文件建立前，Git 工作目錄沒有未提交變更。
- 一般測試最近一次結果：`12` 個測試檔、`68` 項測試全部通過。
- 最近一次瀏覽器載入檢查沒有 Console 錯誤。
- 受保護的管理頁需要 Google 登入；若測試環境沒有登入狀態，介面內容主要由 render/domain 測試驗證。
- 本文件建立後會成為新的未提交檔案，除非之後另行 commit。

## 專案用途與技術架構

這是一套數學課程管理系統，主要功能包括：

- 今日與歷史日期點名
- 學生管理
- 每週排課
- 點名紀錄
- 繳費管理
- 家長／學生選課活動

技術架構：

- 純 HTML、CSS、原生 JavaScript ES Modules。
- 網站由 GitHub Pages 直接發布，不需要 production build。
- `index.html` 是管理端入口。
- `booking.html` 是家長／學生的專屬選課入口。
- Firebase Authentication 使用 Google 登入。
- Cloud Firestore 保存正式業務資料並提供即時同步。
- Cloud Functions 位於 `functions/`，處理公開選課與可信任的交易操作。
- `localStorage` 只保存深色模式與目前選取的點名日期，不保存學生、排課或點名等業務資料。

## 主要程式結構

### 入口與共用層

- `index.html`：管理端頁面與 Firebase import map。
- `booking.html`：公開選課頁。
- `css/style.css`：桌面與手機版共用樣式；手機版主要位於 `@media (max-width: 720px)`。
- `js/app.js`：登入後載入各頁面、路由、即時資料與事件綁定。
- `js/router.js`：管理端頁籤路由。
- `js/store.js`：日期、週次與 state 查詢等共用工具。
- `js/config.js`：工作區與排課時段設定。

### Domain

- `js/domain/models.js`：欄位正規化與基本格式驗證。
- `js/domain/attendance.js`：點名與期數／堂數相關規則。
- `js/domain/schedule.js`：排課 ID、沿用、分組與時期營業時段規則。
- `js/domain/records.js`：紀錄期間與舊資料起點。
- `js/domain/booking.js`：選課活動輸入、時段鍵值與驗證。

### Repository

- `js/repositories/students-repository.js`
- `js/repositories/schedule-repository.js`
- `js/repositories/attendance-repository.js`
- `js/repositories/payments-repository.js`
- `js/repositories/booking-repository.js`
- `js/repositories/workspace-data-repository.js`
- `js/repositories/workspace-repository.js`
- `js/repositories/firestore-paths.js`

Repository 負責 Firestore 讀寫；View 不應直接散落 Firestore 寫入邏輯。

### View

- `js/views/roll-call.js`：今日／歷史日期點名。
- `js/views/students.js`：學生管理與編輯視窗。
- `js/views/schedule.js`：排課頁。
- `js/views/records.js`：歷史紀錄與資料夾。
- `js/views/payment.js`：繳費頁。
- `js/views/booking-campaigns.js`：管理端選課活動。
- `js/booking-app.js`：公開選課頁。

## Firestore 結構

所有主要資料位於：

`workspaces/mpm-main/...`

目前集合：

- `members`：工作區成員與角色。
- `students`：學生基本資料、堂數、期數、狀態與備註。
- `seasons`：暑假、上學期、寒假、下學期。
- `scheduleEntries`：逐日期、時段、學生的排課文件。
- `scheduleOverrides`：每週排課沿用的例外。
- `attendance`：不可任意覆寫的點名紀錄。
- `billingCycles`：待付款或已結清期別。
- `payments`：付款歷史。
- `bookingCampaigns`：選課活動設定。
- `bookingInvitations`：每位學生的私密選課代碼。
- `bookingSubmissions`：家長已送出的選擇。
- `bookingSlotCounters`：選課活動各時段容量計數。
- `migrations`：資料遷移記錄。

重要安全原則：

- 前端隱藏按鈕不是授權機制。
- 正式權限必須同時由 Authentication 與 Firestore Security Rules 控制。
- 不可提交 Token、Private Key、Service Account JSON 或其他秘密資料。
- `firebaseConfig` 是公開的 Web App 識別設定，不等於授權。

## 已完成的產品規則

### 登入與工作區

- 使用 Google Authentication。
- 預設工作區為 `mpm-main`。
- Owner 可初始化工作區與四個學期時期。
- 系統每年 7 月依既有規則處理年級升級。

### 學生管理

- 學生可新增及編輯姓名、年級、目前堂數、目前期數與舊資料起點。
- 編輯視窗包含最多 1000 字的備註。
- 列表只顯示備註摘要，編輯視窗顯示完整內容。
- 只修改備註時，使用獨立的備註更新流程，避免同時覆寫其他學生欄位。
- 學生狀態分為：
  - `active`：在讀
  - `paused`：停課
- 停課學生：
  - 排列在學生列表最下方。
  - 不出現在新排課名單與今日點名名單。
  - 過去排課與點名紀錄仍保留。
- 桌面版學生列表維持完整格式，例如：
  - `1 年級`
  - `4 / 24`
  - `第 1 期`
- 手機版學生管理已精簡：
  - 「新增學生」位於標題右側。
  - 年級只顯示 `1`。
  - 堂數只顯示 `4`。
  - 期數只顯示 `1`。
  - 「編輯」維持橫向並縮小。
  - 手機隱藏列表中的備註摘要。
  - 搜尋獨立一列，年級與排序選單並排。

### 今日點名

- 可切換到今天以前的日期查看歷史點名。
- 每個時段最後有「新增臨時學生」方塊。
- 臨時學生可以搜尋、滾動與一次選取多人。
- 臨時加入只加入指定日期與時段，不會立即點名，也不會沿用到下週。
- 臨時加入會同步出現在該日期的排課頁。
- 點名紀錄可修改到班時間或刪除；實際權限仍由 Firestore Rules 控制。
- 「當日課程人次」按排課時段累計；同一位學生一天排兩堂會計為 2 人次，不會依學生去重。
- 已點名的學生卡使用該筆 `attendance.lessonNumber`，因此同一天第 11、12 堂會各自固定顯示，不會因學生目前堂數更新而一起變動。
- 桌面版學生卡：
  - 年級顯示在姓名右側。
  - 堂數顯示為「第 16 堂」。
  - 不顯示 `/ 24` 與期數。
  - 未繳費只將姓名標紅。
  - 寬畫面三人並排，中等寬度兩人並排。
- 手機版今日點名：
  - 「重新整理」位於標題右側。
  - 學生兩人並排。
  - 顯示姓名及 `堂數 / 到班時間`，例如 `22 / 15:12`。
  - 尚未到班顯示 `22 / 未到`。
  - 已到班按鈕縮成「修改」，未到班保留小型「到班」按鈕。
  - 臨時學生方塊已同步精簡。

### 排課

系統自動建立四個時期：

- 暑假：7 月 1 日至 8 月 31 日
- 上學期：9 月 1 日至隔年 1 月 31 日
- 寒假：2 月 1 日至 2 月最後一天
- 下學期：3 月 1 日至 6 月 30 日

排課營業時間：

- 週一至週五：
  - `15:00`
  - `16:30`
  - `18:00`
  - `19:30`
- 暑假、寒假：不顯示週六。
- 上學期、下學期：右側另有週六上午區塊：
  - `09:00–10:30`
  - `10:30–12:00`
- 週六下午不再提供新排課。
- 舊有週六下午排課或點名資料沒有刪除，只是不出現在新的每日操作介面。

其他排課規則：

- 排課頁可切換四個時期，跳到該時期目前日期或第一週。
- 每週首次開啟時會沿用前一週固定排課。
- 臨時排課不沿用。
- 已有點名紀錄的排課格以綠色標示並鎖定，不能拖曳更動。
- 停課學生不出現在排課候選名單與現行排課顯示。
- 上下學期的週六區塊寬度目前為 `150px`。
- 平日學生姓名仍採兩兩並列，姓名保持單行。

### 紀錄

- 紀錄頁顯示每位學生目前雙月區間與此前最後一筆紀錄。
- 舊資料依雙月建立資料夾。
- 紀錄項目只顯示「第幾堂」，不顯示「第幾期」。
- 資料夾圖示已由 emoji 改成簡約線條造型。
- 停課學生的歷史紀錄仍保留。

### 堂數、期數與付款

- 第 24 堂點名會在同一個 transaction 中推進學生期數並建立待付款期別。
- 付款會建立不可任意修改的付款歷史，並結清對應期別。
- 刪除或修改點名時，不可只改畫面；必須遵守 transaction 與 Security Rules。

### 家長／學生選課活動

- 管理端可建立活動，設定：
  - 對應時期
  - 上課日期區間
  - 家長填寫截止時間
  - 最少與最多選擇數
  - 開放固定週時段
  - 停課日期
- 每個時段容量固定為 10 人。
- 一位學生可選多個固定週時段。
- 發布活動時，系統為每位在讀學生建立專屬連結與 QR Code。
- 家長頁不直接寫入 Firestore；公開讀取與送出由 callable Cloud Functions 處理。
- 選課送出後，整段期間的固定時段會寫入 `scheduleEntries`。
- 選課活動的可選時段與排課營業規則同步：
  - 暑假、寒假只有週一至週五下午。
  - 上學期、下學期另有週六上午。

## 不可破壞的重要原則

1. 不可因 UI 隱藏或學生停課而刪除歷史資料。
2. 已點名的排課不能直接移動或刪除。
3. 臨時學生只加入指定日期，不得自動沿用。
4. 單獨修改備註時，不得覆寫其他學生欄位。
5. 手機版調整若使用者指定「只改手機」，不可改變桌面版視覺。
6. 排課、今日點名與選課活動必須使用一致的營業時段。
7. Firestore 資料結構或全面遷移必須先取得使用者確認。
8. 不可用前端 email 比對或按鈕隱藏取代真正的 Security Rules。

## 響應式介面狀態

- 主要手機斷點：`max-width: 720px`。
- 今日點名在 `max-width: 1050px` 時由三欄改為兩欄；手機仍維持兩欄精簡卡。
- 已特別調整的手機頁：
  - 今日點名
  - 學生管理
- 其他頁面的手機版仍以既有共用樣式為主。若後續要重新設計，應逐頁與使用者確認，且不要影響桌面版。

## 測試與驗證

安裝套件：

```powershell
npm.cmd install
```

一般測試：

```powershell
npm.cmd test
```

Firestore Rules 測試：

```powershell
npm.cmd run test:rules
```

Rules 測試會啟動本機 Firestore Emulator，不應寫入正式資料庫。

每次修改後至少檢查：

1. 相關 domain/view 測試。
2. 完整 `npm.cmd test`。
3. JavaScript 語法。
4. `git diff --check`。
5. 瀏覽器 Console。
6. 既有桌面與手機行為是否被意外影響。

## 發布

一般前端修改：

- Commit 並 push 到 GitHub Pages 使用的分支。
- 不需要 `npm run build`。
- 不需要 Firebase Hosting。

只有變更 Firestore Rules 或 Indexes 時才部署：

```powershell
npx.cmd firebase deploy --only firestore
```

選課 Cloud Functions、Rules 或相關後端第一次上線／修改時：

```powershell
npx.cmd firebase deploy --only functions,firestore
```

## 最近的重要 Git 紀錄

- `451c9b9`：學生管理手機介面
- `a124552`：手機板
- `d0af225`：今日點名修改
- `056a61c`：週六修訂
- `aa05e1a`：修正週六
- `bb3e0dc`：在讀功能
- `2047bbc`：排課版面修訂
- `df02db6`：四時期功能
- `a137498`：Firebase
- `dcaae02`：選課表單
- `8267fa2`：排課頁更新
- `439ded6`：紀錄頁修正

若需確認實際差異，使用：

```powershell
git show <commit>
```

不要只依 commit 標題猜測實作內容。

## 已知注意事項

- 時期類型目前依 `season.id` 或 `season.name` 中的 `summer`、`fall`、`winter`、`spring`／中文名稱判斷。若未來允許任意命名，應改成明確的 `type` 欄位並規劃相容遷移。
- 選課活動開放後，人工更動同一活動日期與時段的排課，可能造成容量計數與實際排課不同；需要調整時應先提前截止活動。
- 正式管理頁的完整視覺驗證需要已授權 Google 帳號。沒有登入狀態時，不可宣稱已手動檢查所有受保護頁面。
- `AGENTS.md` 規定不可直接在 `main` 修改；歷史對話中使用者曾明確要求直接修改 `main`。兩者目前有衝突，新對話開始時應先向使用者確認 Git 流程，並以使用者最新明確指示與安全規範為準。

## 後續更新本文件

每完成一個較大的功能，請同步更新：

- 「目前檢查點」
- 「已完成的產品規則」
- 「響應式介面狀態」
- 「最近的重要 Git 紀錄」
- 「已知注意事項」

不要把聊天紀錄逐字貼入本文件；只保留能幫助後續正確開發的決策、規則、風險與驗證結果。
