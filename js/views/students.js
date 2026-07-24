import { getStudent, makeId, saveState } from "../store.js";

const defaultGrades = Array.from({ length: 12 }, (_, index) => index + 1);

function getGradeOptions(state) {
  return [...new Set([...defaultGrades, ...state.students.map((student) => Number(student.grade)).filter(Number.isFinite)])].sort((a, b) => a - b);
}

export function renderStudents(state, filters = {}) {
  const search = filters.search || "";
  const grade = filters.grade || "all";
  const grades = getGradeOptions(state);
  const students = state.students.filter((student) => (!search || student.name.includes(search)) && (grade === "all" || String(student.grade) === grade));
  return `<div class="page-head"><div><p class="eyebrow">名冊管理</p><h2>學生</h2><p>共 ${state.students.length} 位學生，可直接新增或編輯。</p></div><button class="button-primary" data-action="toggle-student-form">新增學生</button></div>
    <div class="toolbar"><div class="toolbar-start"><input class="input" id="student-search" value="${search}" placeholder="搜尋姓名" /><select class="select" id="grade-filter"><option value="all">全部年級</option>${grades.map((item) => `<option value="${item}" ${String(item) === grade ? "selected" : ""}>${item} 年級</option>`).join("")}</select></div><div class="toolbar-end"><button class="button-secondary" data-action="reset-demo">重設示範資料</button></div></div>
    <div class="panel"><div class="schedule-wrap"><table class="data-table"><thead><tr><th>學生</th><th>年級</th><th>堂數</th><th>期數</th><th>狀態</th><th>操作</th></tr></thead><tbody>${students.length ? students.map(renderRow).join("") : '<tr><td colspan="6" class="empty">找不到符合條件的學生。</td></tr>'}</tbody></table></div></div>`;
}

function renderRow(student) {
  return `<tr><td><strong>${student.name}</strong>${student.paymentPending ? ' <span class="pending-badge">待繳費</span>' : ""}</td><td>${student.grade} 年級</td><td>${student.lessonCount} / 24</td><td>第 ${student.term} 期</td><td><span class="status-badge ${student.status}">${student.status === "active" ? "在讀" : "停課"}</span></td><td><button class="button-secondary" data-action="edit-student" data-student-id="${student.id}">編輯</button></td></tr>`;
}

export function bindStudents(app, state, refresh, showToast) {
  const search = app.querySelector("#student-search");
  const grade = app.querySelector("#grade-filter");
  const rerender = () => { app.innerHTML = renderStudents(state, { search: search.value, grade: grade.value }); bindStudents(app, state, refresh, showToast); };
  search?.addEventListener("input", rerender);
  grade?.addEventListener("change", rerender);
  app.querySelector('[data-action="toggle-student-form"]')?.addEventListener("click", () => showStudentForm(app, state, refresh, showToast));
  app.querySelectorAll('[data-action="edit-student"]').forEach((button) => button.addEventListener("click", () => showStudentForm(app, state, refresh, showToast, getStudent(state, button.dataset.studentId))));
  app.querySelector('[data-action="reset-demo"]')?.addEventListener("click", () => { localStorage.removeItem("mpm-attendance-prototype-v1"); refresh(); showToast("已重設示範資料"); });
}

function showStudentForm(app, state, refresh, showToast, student = null) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "student-modal-title");
  const form = document.createElement("form");
  form.className = "modal-form";
  form.innerHTML = `<div class="modal-head"><h3 id="student-modal-title">${student ? "編輯學生" : "新增學生"}</h3><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="modal-form-grid"><div class="field field-wide"><label>姓名</label><input class="input" name="name" required value="${student?.name || ""}" /></div><div class="field"><label>年級</label><input class="input" name="grade" type="number" min="1" value="${student?.grade ?? 1}" /></div><div class="field"><label>目前堂數</label><input class="input" name="lessonCount" type="number" min="0" max="24" value="${student?.lessonCount ?? 0}" /></div><div class="field"><label>期數</label><input class="input" name="term" type="number" min="1" value="${student?.term ?? 1}" /></div></div><div class="form-actions"><button class="button-primary" type="submit">儲存</button><button class="button-secondary" type="button" data-cancel>取消</button></div>`;
  modal.append(form);
  backdrop.append(modal);
  app.append(backdrop);

  const closeModal = () => backdrop.remove();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeModal(); });
  modal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  form.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  form.querySelector("[data-cancel]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(form); const target = student || { id: makeId("student"), status: "active", paymentPending: false }; Object.assign(target, { name: data.get("name"), grade: Number(data.get("grade")), lessonCount: Number(data.get("lessonCount")), term: Number(data.get("term")) }); if (!student) state.students.push(target); saveState(state); closeModal(); refresh(); showToast(student ? "學生資料已更新" : "學生已新增"); });
  form.querySelector('[name="name"]')?.focus();
}
