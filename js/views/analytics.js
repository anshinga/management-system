import {
  ANALYTICS_DEFAULT_WEEKS,
  ANALYTICS_WEEK_OPTIONS,
  buildAnalyticsDateRange,
  buildAttendanceAnalyticsModel,
  normalizeAnalyticsWeekCount,
} from "../domain/analytics.js";
import {
  clearAttendanceAnalyticsCache,
  getAttendanceAnalyticsRecords,
} from "../repositories/analytics-repository.js";
import { getTodayDate } from "../store.js";
import { getUserErrorMessage } from "../ui/errors.js";
import { escapeHtml } from "../ui/html.js";

function initialViewState(weekCount = ANALYTICS_DEFAULT_WEEKS) {
  return {
    weekCount,
    status: "idle",
    range: null,
    records: [],
    readCount: 0,
    fetchedAt: null,
    fromMemoryCache: false,
    error: "",
  };
}

let analyticsViewState = initialViewState();
let analyticsRequestVersion = 0;

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${year}/${Number(month)}/${Number(day)}`;
}

function formatAnalyzedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function renderControls(viewState, range) {
  const isLoading = viewState.status === "loading";
  const buttonLabel = viewState.status === "success" ? "重新分析" : "開始分析";
  return `<section class="panel analytics-controls">
    <form class="analytics-form" data-analytics-form>
      <label class="field analytics-week-field"><span>分析期間</span><select class="select" name="weekCount" data-analytics-weeks${isLoading ? " disabled" : ""}>${ANALYTICS_WEEK_OPTIONS.map((weekCount) => `<option value="${weekCount}"${weekCount === viewState.weekCount ? " selected" : ""}>最近 ${weekCount} 週</option>`).join("")}</select></label>
      <div class="analytics-range"><span>資料範圍</span><strong>${formatDate(range.startDate)}–${formatDate(range.endDate)}</strong></div>
      <button class="button-primary" type="submit"${isLoading ? " disabled" : ""}>${isLoading ? "正在讀取…" : buttonLabel}</button>
    </form>
    <p class="analytics-read-policy">進入本頁不會讀取歷史點名；只有按下分析按鈕後，才會執行一次最多 13 週的日期範圍查詢。</p>
  </section>`;
}

function renderWeeklyChart(model) {
  const maximum = Math.max(1, model.maxWeeklyTotal);
  return `<section class="panel analytics-section" aria-labelledby="analytics-weekly-title">
    <div class="analytics-section-head"><div><p class="eyebrow">每週實際點名</p><h3 id="analytics-weekly-title">每週總人次</h3></div></div>
    <div class="analytics-chart-scroll"><div class="analytics-weekly-chart" style="--analytics-week-count: ${model.weeks.length}">${model.weeks.map((week) => {
      const height = week.total ? Math.max(8, Math.round((week.total / maximum) * 100)) : 0;
      return `<div class="analytics-week-column" role="img" aria-label="${escapeHtml(week.label)}，${week.total} 人次${week.isInProgress ? "，進行中" : ""}"><strong>${week.total}</strong><div class="analytics-bar-track"><span class="analytics-bar" style="height: ${height}%"></span></div><span>${escapeHtml(week.shortLabel)}</span>${week.isInProgress ? '<small class="analytics-progress-label">進行中</small>' : "<small>&nbsp;</small>"}</div>`;
    }).join("")}</div></div>
  </section>`;
}

function renderSlotTotals(model) {
  return `<section class="panel analytics-section" aria-labelledby="analytics-slot-title">
    <div class="analytics-section-head"><div><p class="eyebrow">所選期間合計</p><h3 id="analytics-slot-title">各時段上課人次</h3></div></div>
    <div class="analytics-slot-grid">${model.slots.map((slot) => `<article class="analytics-slot-card"><span>${escapeHtml(slot)}</span><strong>${model.slotTotals[slot]}</strong><small>人次</small></article>`).join("")}</div>
  </section>`;
}

function renderDetailsTable(model) {
  return `<section class="panel analytics-section" aria-labelledby="analytics-detail-title">
    <div class="analytics-section-head"><div><p class="eyebrow">週次 × 時段</p><h3 id="analytics-detail-title">每週人次明細</h3></div></div>
    <div class="analytics-table-wrap"><table class="data-table analytics-table"><thead><tr><th scope="col">週次</th>${model.slots.map((slot) => `<th scope="col">${escapeHtml(slot)}</th>`).join("")}<th scope="col">合計</th></tr></thead><tbody>${model.weeks.map((week) => `<tr${week.isInProgress ? ' class="is-in-progress"' : ""}><th scope="row"><span>${escapeHtml(week.label)}</span>${week.isInProgress ? "<small>進行中</small>" : ""}</th>${model.slots.map((slot) => `<td>${week.slotCounts[slot]}</td>`).join("")}<td><strong>${week.total}</strong></td></tr>`).join("")}</tbody></table></div>
  </section>`;
}

function renderResult(state, viewState) {
  const model = buildAttendanceAnalyticsModel({
    students: state.students,
    attendance: viewState.records,
  }, viewState.range);
  if (model.total === 0) {
    return `<section class="panel empty analytics-empty"><strong>這段期間沒有在讀學生的上課點名紀錄</strong><p>可以更換分析期間後再試一次。</p></section>
      <p class="analytics-result-meta">本次讀取 ${viewState.readCount} 筆點名紀錄・分析於 ${escapeHtml(formatAnalyzedAt(viewState.fetchedAt))}${viewState.fromMemoryCache ? "・使用本次開啟期間暫存" : ""}</p>`;
  }
  return `${renderWeeklyChart(model)}${renderSlotTotals(model)}${renderDetailsTable(model)}
    <p class="analytics-result-meta">本次讀取 ${viewState.readCount} 筆點名紀錄・分析於 ${escapeHtml(formatAnalyzedAt(viewState.fetchedAt))}${viewState.fromMemoryCache ? "・使用本次開啟期間暫存" : ""}</p>`;
}

export function renderAnalytics(state, {
  viewState = analyticsViewState,
  todayDate = getTodayDate(),
} = {}) {
  const range = viewState.range || buildAnalyticsDateRange(viewState.weekCount, todayDate);
  const content = viewState.status === "loading"
    ? '<section class="panel empty analytics-empty" aria-busy="true"><strong>正在讀取指定期間的點名紀錄…</strong><p>只會讀取這次分析需要的日期範圍。</p></section>'
    : viewState.status === "error"
      ? `<section class="panel empty analytics-empty analytics-error"><strong>暫時無法完成分析</strong><p>${escapeHtml(viewState.error)}</p></section>`
      : viewState.status === "success"
        ? renderResult(state, viewState)
        : '<section class="panel empty analytics-empty"><strong>尚未讀取歷史點名資料</strong><p>選擇週數並按下「開始分析」後，才會載入統計資料。</p></section>';

  return `<div class="page-head analytics-page-head"><div><p class="eyebrow">在讀學生・實際上課人次</p><h2>數據統計與分析</h2><p>依每週與上課時段查看點名人次，不包含停課、請假或未到班資料。</p></div></div>
    ${renderControls(viewState, range)}
    <div class="analytics-results">${content}</div>`;
}

export function resetAnalyticsView() {
  analyticsRequestVersion += 1;
  analyticsViewState = initialViewState();
  clearAttendanceAnalyticsCache();
}

export function bindAnalytics(app, refresh) {
  const form = app.querySelector("[data-analytics-form]");
  const weekSelect = app.querySelector("[data-analytics-weeks]");
  weekSelect?.addEventListener("change", () => {
    const weekCount = normalizeAnalyticsWeekCount(weekSelect.value);
    analyticsRequestVersion += 1;
    analyticsViewState = initialViewState(weekCount);
    refresh(true);
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const weekCount = normalizeAnalyticsWeekCount(form.elements.weekCount.value);
    const range = buildAnalyticsDateRange(weekCount, getTodayDate());
    const force = analyticsViewState.status === "success";
    const requestVersion = ++analyticsRequestVersion;
    analyticsViewState = {
      ...initialViewState(weekCount),
      status: "loading",
      range,
    };
    refresh(true);
    try {
      const result = await getAttendanceAnalyticsRecords(range, { force });
      if (requestVersion !== analyticsRequestVersion) return;
      analyticsViewState = {
        weekCount,
        status: "success",
        range,
        records: result.records,
        readCount: result.readCount,
        fetchedAt: result.fetchedAt,
        fromMemoryCache: result.fromMemoryCache,
        error: "",
      };
    } catch (error) {
      if (requestVersion !== analyticsRequestVersion) return;
      analyticsViewState = {
        ...initialViewState(weekCount),
        status: "error",
        range,
        error: getUserErrorMessage(error, "目前無法讀取分析資料，請稍後再試。"),
      };
    }
    refresh(true);
  });
}
