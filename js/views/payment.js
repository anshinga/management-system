import { confirmPayment, saveState } from "../store.js";

export function renderPayment(state) {
  const pending = state.students.filter((student) => student.paymentPending);
  return `<div class="page-head"><div><p class="eyebrow">一期 24 堂</p><h2>繳費</h2><p>確認已繳費後，系統會自動開啟下一期。</p></div><span class="pending-badge">${pending.length} 位待處理</span></div><div class="payment-list">${pending.length ? pending.map((student) => `<div class="payment-row"><div class="payment-info"><span class="grade-badge">${student.grade} 年級</span><div><strong>${student.name}</strong><div class="payment-count">第 ${student.term} 期・已完成 ${student.lessonCount} 堂</div></div></div><button class="button-primary" data-action="paid" data-student-id="${student.id}">已繳費</button></div>`).join("") : '<div class="panel empty">目前沒有待繳費學生。</div>'}</div>`;
}

export function bindPayment(app, state, refresh, showToast) {
  app.querySelectorAll('[data-action="paid"]').forEach((button) => button.addEventListener("click", () => { confirmPayment(state, button.dataset.studentId); refresh(); showToast("已開啟下一期"); }));
}
