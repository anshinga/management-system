import { initRouter } from "./router.js";
import { getState } from "./store.js";
import { renderRollCall, bindRollCall } from "./views/roll-call.js";
import { renderStudents, bindStudents } from "./views/students.js";
import { renderSchedule, bindSchedule } from "./views/schedule.js";
import { renderRecords } from "./views/records.js";
import { renderPayment, bindPayment } from "./views/payment.js";

const app = document.querySelector("#app");
let state = getState();
let currentRoute = "roll-call";

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function refresh() {
  state = getState();
  app.innerHTML = currentRoute === "roll-call" ? renderRollCall(state, refresh) : currentRoute === "students" ? renderStudents(state) : currentRoute === "schedule" ? renderSchedule(state) : currentRoute === "records" ? renderRecords(state) : renderPayment(state);
  if (currentRoute === "roll-call") bindRollCall(app, state, refresh);
  if (currentRoute === "students") bindStudents(app, state, refresh, showToast);
  if (currentRoute === "schedule") bindSchedule(app, state, refresh);
  if (currentRoute === "payment") bindPayment(app, state, refresh, showToast);
  app.querySelector('[data-action="refresh"]')?.addEventListener("click", refresh);
}

initRouter((route) => { currentRoute = ["roll-call", "students", "schedule", "records", "payment"].includes(route) ? route : "roll-call"; refresh(); });
document.querySelector("#theme-toggle").addEventListener("click", () => { document.body.classList.toggle("dark"); localStorage.setItem("mpm-theme", document.body.classList.contains("dark") ? "dark" : "light"); });
if (localStorage.getItem("mpm-theme") === "dark") document.body.classList.add("dark");
