import {
  ensurePaymentReminders,
  markBillingCyclePaid,
} from "../repositories/payments-repository.js";
import { getPaymentReminderItems } from "../domain/payments.js";
import { getStudent } from "../store.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

let lastReminderEnsureKey = "";

function sortedReminderItems(state) {
  return getPaymentReminderItems(state.students, state.billingCycles)
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

export function renderPayment(state) {
  const reminders = sortedReminderItems(state);
  const rows = reminders.map((item) => `
    <article class="payment-row payment-reminder-row">
      <div class="payment-info">
        <span class="grade-badge">${item.student?.grade ?? "—"} 年級</span>
        <div>
          <strong>${escapeHtml(item.student?.name || "未知學生")}</strong>
          <div class="payment-count">第 ${item.term} 期・目前第 ${displayLessonCount(item.student)} 堂，待寄收費單</div>
        </div>
      </div>
      <label class="payment-paid-check">
        <input type="checkbox" data-action="mark-payment-paid" data-cycle-id="${escapeAttribute(item.id)}" data-student-id="${escapeAttribute(item.studentId)}" data-term="${item.term}" />
        <span>已寄送收費單</span>
      </label>
    </article>`).join("");

  return `<div class="page-head"><div><p class="eyebrow">第 20 堂後提醒</p><h2>收費單提醒</h2><p>學生完成第 20 堂後會出現在這裡；確認已寄送後解除該期提醒；全部寄送完成後解除點名紅字。</p></div><span class="pending-badge">${reminders.length} 筆待寄送</span></div>
    <section class="payment-list" aria-labelledby="payment-reminder-title"><h3 id="payment-reminder-title">待寄收費單名單</h3>${rows || '<div class="panel empty">目前沒有待寄送的收費單。</div>'}</section>`;
}

export function bindPayment(app, state, refresh, showToast) {
  const derivedReminderIds = getPaymentReminderItems(state.students, state.billingCycles)
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

  app.querySelectorAll('[data-action="mark-payment-paid"]').forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      if (!checkbox.checked) return;
      if (!window.confirm(`確定已寄送這位學生第 ${checkbox.dataset.term} 期的收費單嗎？確認後會解除該期提醒，且不可自行取消。`)) {
        checkbox.checked = false;
        return;
      }
      checkbox.disabled = true;
      try {
        await markBillingCyclePaid(checkbox.dataset.cycleId, {
          studentId: checkbox.dataset.studentId,
          term: Number(checkbox.dataset.term),
        });
        showToast("已標記為已寄送收費單，該期提醒已解除");
      } catch (error) {
        checkbox.checked = false;
        checkbox.disabled = false;
        showToast(getUserErrorMessage(error, "無法更新收費單提醒"));
      }
    });
  });
}
