import { getStudent, getSchedule, makeId, saveState } from "../store.js";

const slots = ["15:00", "16:30", "18:00", "19:00", "19:30", "21:00"];
const days = ["週一", "週二", "週三", "週四", "週五", "週六"];

export function renderSchedule(state) {
  return `<div class="page-head"><div><p class="eyebrow">${state.seasons[0]?.name || "目前時段"}</p><h2>排課</h2><p>選擇日期與時間格，安排一位或多位學生。</p></div><span class="status-badge active">編輯模式</span></div><div class="panel schedule-wrap"><div class="schedule-grid"><div class="schedule-label">時間</div>${days.map((day) => `<div class="schedule-day">${day}</div>`).join("")}${slots.map((slot) => `<div class="schedule-label">${slot}</div>${days.map((_, index) => renderCell(state, index + 1, slot)).join("")}`).join("")}</div></div>`;
}

function renderCell(state, weekday, slot) {
  const schedule = getSchedule(state, weekday, slot);
  const names = schedule?.studentIds.map((id) => getStudent(state, id)?.name).filter(Boolean) || [];
  return `<div class="schedule-cell"><div class="slot-title">${names.length} 人</div><div class="schedule-names">${names.map((name) => `<span class="name-chip">${name}</span>`).join("") || '<span class="student-subtitle">尚未排課</span>'}</div><button class="cell-edit" data-action="edit-cell" data-weekday="${weekday}" data-slot="${slot}">編輯學生</button></div>`;
}

export function bindSchedule(app, state, refresh) {
  app.querySelectorAll('[data-action="edit-cell"]').forEach((button) => button.addEventListener("click", () => openScheduleModal(state, button.dataset.weekday, button.dataset.slot, refresh)));
}

function openScheduleModal(state, weekday, slot, refresh) {
  const schedule = getSchedule(state, Number(weekday), slot);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal"><div class="modal-head"><h3>${days[weekday - 1]} ${slot}</h3><button class="round-button" data-close type="button">關</button></div><p class="student-subtitle">勾選這個時間格的學生</p><div class="checkbox-list">${state.students.filter((student) => student.status === "active").map((student) => `<label class="checkbox-item"><input type="checkbox" value="${student.id}" ${(schedule?.studentIds || []).includes(student.id) ? "checked" : ""} />${student.name}（${student.grade}年級）</label>`).join("")}</div><button class="button-primary" data-save type="button">儲存排課</button></div>`;
  document.body.append(backdrop);
  backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("[data-save]").addEventListener("click", () => { const studentIds = [...backdrop.querySelectorAll("input:checked")].map((input) => input.value); if (schedule) schedule.studentIds = studentIds; else state.schedules.push({ id: makeId("schedule"), season: "summer-2026", weekday: Number(weekday), slot, studentIds }); saveState(state); backdrop.remove(); refresh(); });
}
