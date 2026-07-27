import { confirmBillingCyclePayment } from "../repositories/payments-repository.js";
import { getStudent, getTodayDate } from "../store.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

const methodLabels = {
  cash: "現金",
  transfer: "轉帳",
  card: "刷卡",
  other: "其他",
};

function formatCurrency(amount) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function timestampValue(value) {
  return typeof value?.toMillis === "function" ? value.toMillis() : 0;
}

function displayTimestamp(value) {
  if (typeof value?.toDate !== "function") return "同步中";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value.toDate());
}

export function renderPayment(state) {
  const pending = state.billingCycles
    .filter((cycle) => cycle.status === "pending")
    .sort((a, b) => timestampValue(a.completedAt) - timestampValue(b.completedAt));
  const payments = [...state.payments]
    .sort((a, b) => b.paidDate.localeCompare(a.paidDate) || timestampValue(b.createdAt) - timestampValue(a.createdAt));

  const pendingRows = pending.map((cycle) => {
    const student = getStudent(state, cycle.studentId);
    return `<div class="payment-row"><div class="payment-info"><span class="grade-badge">${student?.grade ?? "—"} 年級</span><div><strong>${escapeHtml(student?.name || "未知學生")}</strong><div class="payment-count">第 ${cycle.term} 期・完成於 ${escapeHtml(displayTimestamp(cycle.completedAt))}</div></div></div><button class="button-primary" data-action="paid" data-cycle-id="${escapeAttribute(cycle.id)}">登記付款</button></div>`;
  }).join("");

  const historyRows = payments.map((payment) => {
    const student = getStudent(state, payment.studentId);
    return `<tr><td>${escapeHtml(payment.paidDate)}</td><td><strong>${escapeHtml(student?.name || "未知學生")}</strong></td><td>第 ${payment.term} 期</td><td>${formatCurrency(payment.amount)}</td><td>${escapeHtml(methodLabels[payment.method] || "其他")}</td><td>${escapeHtml(payment.note || "—")}</td></tr>`;
  }).join("");

  return `<div class="page-head"><div><p class="eyebrow">每期 24 堂</p><h2>繳費</h2><p>完成第 24 堂時會結算該期；付款後保留不可變更的歷史紀錄。</p></div><span class="pending-badge">${pending.length} 期待處理</span></div>
    <section class="payment-list" aria-labelledby="pending-payment-title"><h3 id="pending-payment-title">待付款期別</h3>${pendingRows || '<div class="panel empty">目前沒有待付款期別。</div>'}</section>
    <section class="payment-history" aria-labelledby="payment-history-title"><div class="page-head compact"><div><h3 id="payment-history-title">付款歷史</h3><p>共 ${payments.length} 筆</p></div></div><div class="panel"><div class="schedule-wrap"><table class="data-table"><thead><tr><th>付款日期</th><th>學生</th><th>期別</th><th>金額</th><th>方式</th><th>備註</th></tr></thead><tbody>${historyRows || '<tr><td colspan="6" class="empty">尚無付款紀錄。</td></tr>'}</tbody></table></div></div></section>`;
}

function openPaymentForm(app, state, cycle, showToast) {
  const student = getStudent(state, cycle.studentId);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "payment-modal-title");
  modal.innerHTML = `<form class="modal-form" data-payment-form><div class="modal-head"><h3 id="payment-modal-title">登記付款</h3><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="modal-form-grid"><div class="field field-wide"><label>學生與期別</label><input class="input" disabled value="${escapeAttribute(`${student?.name || "未知學生"}・第 ${cycle.term} 期`)}" /></div><div class="field"><label for="payment-amount">金額</label><input class="input" id="payment-amount" name="amount" type="number" min="0" step="1" required inputmode="numeric" /></div><div class="field"><label for="payment-method">付款方式</label><select class="select" id="payment-method" name="method"><option value="cash">現金</option><option value="transfer">轉帳</option><option value="card">刷卡</option><option value="other">其他</option></select></div><div class="field"><label for="payment-date">付款日期</label><input class="input" id="payment-date" name="paidDate" type="date" required value="${getTodayDate()}" /></div><div class="field field-wide"><label for="payment-note">備註</label><textarea class="input" id="payment-note" name="note" maxlength="500" rows="3" placeholder="選填"></textarea></div></div><div class="form-actions"><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit">確認付款</button></div></form>`;
  backdrop.append(modal);
  app.append(backdrop);

  const form = modal.querySelector("[data-payment-form]");
  const close = () => backdrop.remove();
  modal.querySelector("[data-close-modal]").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const data = new FormData(form);
    try {
      await confirmBillingCyclePayment(cycle.id, {
        amount: data.get("amount"),
        method: data.get("method"),
        paidDate: data.get("paidDate"),
        note: data.get("note"),
      });
      close();
      showToast("付款已登記並保留歷史紀錄");
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "付款登記失敗"));
    }
  });
  form.elements.amount.focus();
}

export function bindPayment(app, state, refresh, showToast) {
  app.querySelectorAll('[data-action="paid"]').forEach((button) => {
    button.addEventListener("click", () => {
      const cycle = state.billingCycles.find((item) => item.id === button.dataset.cycleId);
      if (cycle) openPaymentForm(app, state, cycle, showToast);
    });
  });
}
