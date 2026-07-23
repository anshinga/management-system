import { getStudent } from "../store.js";

export function renderRecords(state) {
  const records = [...state.students].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)).map((student) => { const history = state.attendance.filter((item) => item.studentId === student.id).sort((a, b) => a.date.localeCompare(b.date)); return `<div class="record-row"><div class="record-meta"><span class="grade-badge">${student.grade} 年級</span><strong>${student.name}</strong></div><div class="record-history">${history.length ? history.map((item) => `<div class="record-item"><span class="record-date">${item.date}</span><span class="record-lesson">第 ${item.lessonNumber} 堂</span></div>`).join("") : '<span class="student-subtitle">尚無點名紀錄</span>'}</div></div>`; });
  return `<div class="page-head"><div><p class="eyebrow">歷史出席</p><h2>紀錄</h2><p>每位學生一列，橫向查看日期與堂數。</p></div></div><div class="record-list">${records.join("")}</div>`;
}
