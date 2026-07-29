import { createStudent, updateStudent, updateStudentNote } from "../repositories/students-repository.js";
import { resolvePreviousLessonFields } from "../domain/records.js";
import { getStudent, getTodayDate } from "../store.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

const defaultGrades = Array.from({ length: 12 }, (_, index) => index + 1);
const defaultSort = "grade";
const NOTE_PREVIEW_LENGTH = 60;

function summarizeNote(note) {
  const normalizedNote = typeof note === "string" ? note.trim() : "";
  if (!normalizedNote) return "";
  return normalizedNote.length > NOTE_PREVIEW_LENGTH
    ? `${normalizedNote.slice(0, NOTE_PREVIEW_LENGTH)}…`
    : normalizedNote;
}

function getGradeOptions(state) {
  return [...new Set([...defaultGrades, ...state.students.map((student) => Number(student.grade)).filter(Number.isFinite)])].sort((a, b) => a - b);
}

export function sortStudents(students, sort = defaultSort) {
  const compareName = (a, b) => a.name.localeCompare(b.name);
  return [...students].sort((a, b) => {
    const statusDifference = (a.status === "paused" ? 1 : 0) - (b.status === "paused" ? 1 : 0);
    if (statusDifference) return statusDifference;
    if (sort === "lessons-desc") {
      return b.currentLessonCount - a.currentLessonCount || a.grade - b.grade || compareName(a, b);
    }
    if (sort === "lessons-asc") {
      return a.currentLessonCount - b.currentLessonCount || a.grade - b.grade || compareName(a, b);
    }
    return a.grade - b.grade || compareName(a, b);
  });
}

export function renderStudents(state, filters = {}) {
  const search = filters.search || "";
  const grade = filters.grade || "all";
  const sort = filters.sort || defaultSort;
  const grades = getGradeOptions(state);
  const students = sortStudents(
    state.students.filter((student) => (!search || student.name.includes(search)) && (grade === "all" || String(student.grade) === grade)),
    sort,
  );
  return `<div class="page-head"><div><p class="eyebrow">名冊管理</p><h2>學生</h2><p>共 ${state.students.length} 位學生，變更會即時同步。</p></div><button class="button-primary" data-action="toggle-student-form">新增學生</button></div>
    <div class="toolbar"><div class="toolbar-start"><input class="input" id="student-search" value="${escapeAttribute(search)}" placeholder="搜尋姓名" /><select class="select" id="grade-filter"><option value="all">全部年級</option>${grades.map((item) => `<option value="${item}" ${String(item) === grade ? "selected" : ""}>${item} 年級</option>`).join("")}</select><select class="select" id="student-sort" aria-label="學生排序方式"><option value="grade" ${sort === "grade" ? "selected" : ""}>依年級排序</option><option value="lessons-desc" ${sort === "lessons-desc" ? "selected" : ""}>堂數：多到少</option><option value="lessons-asc" ${sort === "lessons-asc" ? "selected" : ""}>堂數：少到多</option></select></div></div>
    <div class="panel"><div class="schedule-wrap"><table class="data-table"><thead><tr><th>學生</th><th>年級</th><th>堂數</th><th>期數</th><th>狀態</th><th>操作</th></tr></thead><tbody>${students.length ? students.map(renderRow).join("") : '<tr><td colspan="6" class="empty">找不到符合條件的學生。</td></tr>'}</tbody></table></div></div>`;
}

function renderRow(student) {
  const noteSummary = summarizeNote(student.note);
  return `<tr><td><strong>${escapeHtml(student.name)}</strong>${student.paymentPending ? ` <span class="pending-badge">${student.pendingPaymentCount} 期待付款</span>` : ""}${noteSummary ? `<div class="student-note-summary" title="${escapeAttribute(student.note)}">${escapeHtml(noteSummary)}</div>` : ""}</td><td>${student.grade} 年級</td><td>${student.currentLessonCount} / 24</td><td>第 ${student.currentTerm} 期</td><td><span class="status-badge ${student.status}">${student.status === "active" ? "在讀" : "停課"}</span></td><td><button class="button-secondary" data-action="edit-student" data-student-id="${escapeAttribute(student.id)}">編輯</button></td></tr>`;
}

export function renderStudentStatusSelect(student) {
  if (!student) return "";
  const status = student.status === "paused" ? "paused" : "active";
  return `<select class="student-status-select ${status}" name="status" aria-label="學生狀態"><option value="active"${status === "active" ? " selected" : ""}>在讀</option><option value="paused"${status === "paused" ? " selected" : ""}>停課</option></select>`;
}

export function bindStudents(app, state, refresh, showToast) {
  const search = app.querySelector("#student-search");
  const grade = app.querySelector("#grade-filter");
  const sort = app.querySelector("#student-sort");
  const rerender = () => {
    app.innerHTML = renderStudents(state, {
      search: search.value,
      grade: grade.value,
      sort: sort.value,
    });
    bindStudents(app, state, refresh, showToast);
  };
  search?.addEventListener("input", rerender);
  grade?.addEventListener("change", rerender);
  sort?.addEventListener("change", rerender);
  app.querySelector('[data-action="toggle-student-form"]')?.addEventListener("click", () => showStudentForm(app, state, refresh, showToast));
  app.querySelectorAll('[data-action="edit-student"]').forEach((button) => button.addEventListener("click", () => showStudentForm(app, state, refresh, showToast, getStudent(state, button.dataset.studentId))));
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
  form.innerHTML = `<div class="modal-head"><div class="student-modal-title-row"><h3 id="student-modal-title">${student ? "編輯學生" : "新增學生"}</h3>${renderStudentStatusSelect(student)}</div><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="modal-form-grid"><div class="field field-wide"><label>姓名</label><input class="input" name="name" required maxlength="100" value="${escapeAttribute(student?.name || "")}" /></div><div class="field"><label>年級</label><input class="input" name="grade" type="number" min="1" max="20" required value="${student?.grade ?? 1}" /></div><div class="field"><label>目前堂數</label><input class="input" name="currentLessonCount" type="number" min="0" max="23" required value="${student?.currentLessonCount ?? 0}" /></div><div class="field"><label>目前期數</label><input class="input" name="currentTerm" type="number" min="1" required value="${student?.currentTerm ?? 1}" /></div><div class="field"><label>上一次上課日期（選填）</label><input class="input" name="previousLessonDate" type="date" max="${getTodayDate()}" value="${escapeAttribute(student?.previousLessonDate || "")}" /><small class="student-subtitle">僅作為舊資料起點，不會建立或修改點名紀錄。</small></div><div class="field field-wide"><label for="student-note">備註</label><textarea class="input" id="student-note" name="note" maxlength="1000" rows="4" placeholder="可輸入學生備註">${escapeHtml(student?.note || "")}</textarea><small class="student-subtitle">最多 1000 字。</small></div></div><div class="form-actions"><button class="button-primary" type="submit">儲存</button><button class="button-secondary" type="button" data-cancel>取消</button></div>`;
  modal.append(form);
  backdrop.append(modal);
  app.append(backdrop);

  const closeModal = () => backdrop.remove();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeModal(); });
  modal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  form.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  form.querySelector("[data-cancel]").addEventListener("click", closeModal);
  const statusSelect = form.querySelector('[name="status"]');
  statusSelect?.addEventListener("change", () => {
    statusSelect.classList.toggle("active", statusSelect.value === "active");
    statusSelect.classList.toggle("paused", statusSelect.value === "paused");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const data = new FormData(form);
    const baseInput = {
      ...(student || {}),
      name: data.get("name"),
      grade: Number(data.get("grade")),
      currentLessonCount: Number(data.get("currentLessonCount")),
      currentTerm: Number(data.get("currentTerm")),
      previousLessonDate: data.get("previousLessonDate"),
      note: data.get("note"),
      status: student ? data.get("status") : "active",
      pendingPaymentCount: student?.pendingPaymentCount || 0,
      paymentPending: Boolean(student?.paymentPending),
    };
    try {
      const hasStudentFieldChanges = student && (
        baseInput.name.trim() !== String(student.name || "").trim()
        || baseInput.grade !== Number(student.grade)
        || baseInput.currentLessonCount !== Number(student.currentLessonCount)
        || baseInput.currentTerm !== Number(student.currentTerm)
        || baseInput.previousLessonDate !== String(student.previousLessonDate || "")
        || baseInput.status !== student.status
      );
      const noteChanged = String(baseInput.note || "").trim() !== String(student?.note || "").trim();
      if (!student) {
        await createStudent({
          ...baseInput,
          ...resolvePreviousLessonFields(student, baseInput, state.attendance),
        });
      } else if (!hasStudentFieldChanges && noteChanged) {
        await updateStudentNote(student.id, baseInput.note);
      } else {
        await updateStudent(student.id, {
          ...baseInput,
          ...resolvePreviousLessonFields(student, baseInput, state.attendance),
        });
      }
      closeModal();
      showToast(student ? "學生資料已更新" : "學生已新增");
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "學生資料儲存失敗"));
    }
  });
  form.querySelector('[name="name"]')?.focus();
}
