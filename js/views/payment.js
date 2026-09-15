import {
  ensurePaymentReminders,
  markBillingCyclePaid,
  markBillingNoticeSent,
} from "../repositories/payments-repository.js";
import {
  getAwaitingPaymentItems,
  getBillingNoticeItems,
} from "../domain/payments.js";
import { getStudent } from "../store.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

let lastReminderEnsureKey = "";

const paymentDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function withStudents(state, items) {
  return items
    .map((item) => ({ ...item, student: getStudent(state, item.studentId) }))
    .sort((a, b) => (
      Number(a.student?.grade || 0) - Number(b.student?.grade || 0)
      || String(a.student?.name || "").localeCompare(String(b.student?.name || ""), "zh-Hant")
      || Number(a.term) - Number(b.term)
    ));
}

function displayLessonCount(student) {
  const lessonCount = Number(student?.currentLessonCount);
  return Number.isInteger(lessonCount) ? lessonCount : "—";
}

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  return 0;
}

function formatPaymentTime(value) {
  const millis = timestampMillis(value);
  return millis
    ? paymentDateFormatter.format(new Date(millis)).replace(/\s+/gu, " ")
    : "時間待同步";
}

function formatPaymentRecordTime(payment) {
  if (payment.paidAt) return formatPaymentTime(payment.paidAt);
  if (/^\d{4}-\d{2}-\d{2}$/.test(payment.paidDate || "")) {
    return `${payment.paidDate.replaceAll("-", "/")}（舊紀錄）`;
  }
  return formatPaymentTime(payment.paidDate);
}

function renderBillingRow(item, {
  action,
  label,
  description,
  canManage,
}) {
  return `<article class="payment-row payment-reminder-row">
    <div class="payment-info">
      <span class="grade-badge">${item.student?.grade ?? "—"} 年級</span>
      <div>
        <strong>${escapeHtml(item.student?.name || "未知學生")}</strong>
        <div class="payment-count">第 ${item.term} 期・${escapeHtml(description(item))}</div>
      </div>
    </div>
    ${canManage ? `<label class="payment-paid-check">
      <input type="checkbox" data-action="${action}" data-cycle-id="${escapeAttribute(item.id)}" data-student-id="${escapeAttribute(item.studentId)}" data-term="${item.term}" />
      <span>${label}</span>
    </label>` : `<span class="payment-state-label">${label}</span>`}
  </article>`;
}

function renderPaymentHistory(state) {
  const rows = [...(state.payments || [])]
    .sort((a, b) => timestampMillis(b.paidAt || b.paidDate) - timestampMillis(a.paidAt || a.paidDate))
    .map((payment) => {
      const student = getStudent(state, payment.studentId);
      const studentName = payment.studentName || student?.name || "未知學生";
      return `<article class="payment-row payment-history-row">
        <div class="payment-info">
          <span class="grade-badge">第 ${Number(payment.term) || "—"} 期</span>
          <div><strong>${escapeHtml(studentName)}</strong><div class="payment-history-time">${escapeHtml(formatPaymentRecordTime(payment))}</div></div>
        </div>
      </article>`;
    }).join("");
  return rows || '<div class="panel empty">目前沒有繳費紀錄。</div>';
}

export function renderPayment(state, { canManage = true } = {}) {
  const noticeItems = withStudents(
    state,
    getBillingNoticeItems(state.students, state.billingCycles),
  );
  const awaitingItems = withStudents(
    state,
    getAwaitingPaymentItems(state.students, state.billingCycles),
  );
  const noticeRows = noticeItems.map((item) => renderBillingRow(item, {
    action: "mark-notice-sent",
    label: "已開收費單",
    description: ({ student }) => `目前第 ${displayLessonCount(student)} 堂，待開收費單`,
    canManage,
  })).join("");
  const awaitingRows = awaitingItems.map((item) => renderBillingRow(item, {
    action: "mark-payment-paid",
    label: "已繳費",
    description: () => "收費單已開，等待繳費",
    canManage,
  })).join("");

  return `<div class="page-head"><div><p class="eyebrow">第 20 堂後提醒</p><h2>收費單與繳費</h2><p>開立收費單後會移至待繳費區；確認繳費才解除點名紅字並保存繳費時間。</p></div><span class="pending-badge">${noticeItems.length} 筆待開・${awaitingItems.length} 筆待繳</span></div>
    <section class="payment-list" aria-labelledby="billing-notice-title"><h3 id="billing-notice-title">待開收費單</h3>${noticeRows || '<div class="panel empty">目前沒有待開立的收費單。</div>'}</section>
    <section class="payment-list payment-stage" aria-labelledby="awaiting-payment-title"><h3 id="awaiting-payment-title">待繳費</h3>${awaitingRows || '<div class="panel empty">目前沒有待繳費項目。</div>'}</section>
    <section class="payment-list payment-history" aria-labelledby="payment-history-title"><h3 id="payment-history-title">繳費紀錄</h3>${renderPaymentHistory(state)}</section>`;
}

function bindConfirmationAction(app, {
  action,
  confirmMessage,
  execute,
  successMessage,
  errorMessage,
}, showToast) {
  app.querySelectorAll(`[data-action="${action}"]`).forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      if (!checkbox.checked) return;
      const term = Number(checkbox.dataset.term);
      if (!window.confirm(confirmMessage(term))) {
        checkbox.checked = false;
        return;
      }
      checkbox.disabled = true;
      try {
        await execute(checkbox.dataset.cycleId, {
          studentId: checkbox.dataset.studentId,
          term,
        });
        showToast(successMessage);
      } catch (error) {
        checkbox.checked = false;
        checkbox.disabled = false;
        showToast(getUserErrorMessage(error, errorMessage));
      }
    });
  });
}

export function bindPayment(app, state, refresh, showToast) {
  const derivedReminderIds = getBillingNoticeItems(state.students, state.billingCycles)
    .filter((item) => item.isDerived)
    .map((item) => item.id)
    .sort();
  const ensureKey = derivedReminderIds.join("\u0000");
  if (ensureKey && ensureKey !== lastReminderEnsureKey) {
    lastReminderEnsureKey = ensureKey;
    ensurePaymentReminders(state.students, state.billingCycles).catch((error) => {
      if (lastReminderEnsureKey === ensureKey) lastReminderEnsureKey = "";
      showToast(getUserErrorMessage(error, "無法補建收費單提醒"));
    });
  }

  bindConfirmationAction(app, {
    action: "mark-notice-sent",
    confirmMessage: (term) => `確定已開立這位學生第 ${term} 期的收費單嗎？確認後會移至待繳費區。`,
    execute: markBillingNoticeSent,
    successMessage: "已移至待繳費區",
    errorMessage: "無法更新收費單狀態",
  }, showToast);
  bindConfirmationAction(app, {
    action: "mark-payment-paid",
    confirmMessage: (term) => `確定這位學生第 ${term} 期已繳費嗎？確認後會保存繳費時間，且不可自行取消。`,
    execute: markBillingCyclePaid,
    successMessage: "已保存繳費紀錄並解除紅字提醒",
    errorMessage: "無法保存繳費紀錄",
  }, showToast);
}
