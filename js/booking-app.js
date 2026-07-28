import { httpsCallable } from "firebase/functions";
import { BOOKING_WEEKDAYS, formatBookingSlot, parseBookingSlotKey } from "./domain/booking.js";
import { functions } from "./firebase/functions.js";
import { escapeAttribute, escapeHtml } from "./ui/html.js";

const app = document.querySelector("#booking-public-app");
const token = new URLSearchParams(location.search).get("token")?.trim() || "";
const getInvitation = httpsCallable(functions, "getBookingInvitation");
const submitSelection = httpsCallable(functions, "submitBookingSelection");
let invitationData = null;

function formatDeadline(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "未設定";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getErrorMessage(error, fallback = "目前無法完成操作，請稍後再試。") {
  const code = String(error?.code || "").split("/").pop();
  const messages = {
    "not-found": "這個選課連結不存在或已失效。",
    "failed-precondition": error?.message || "這個選課活動尚未開放或已截止。",
    "already-exists": "這位學生已經送出選擇，不能重複填寫。",
    "resource-exhausted": error?.message || "其中一個時段剛剛額滿，請重新選擇。",
    unavailable: "目前無法連線，請檢查網路後再試。",
    internal: "系統暫時無法處理，請稍後再試。",
  };
  return messages[code] || fallback;
}

function renderError(message) {
  app.innerHTML = `<section class="booking-public-card booking-public-error"><p class="eyebrow">無法開啟</p><h1>選課連結無法使用</h1><p>${escapeHtml(message)}</p></section>`;
}

function renderConfirmation(data) {
  const selectedSlots = data.submission?.selectedSlots || [];
  app.innerHTML = `<section class="booking-public-card"><div class="booking-confirmation-mark" aria-hidden="true">✓</div><p class="eyebrow">登記完成</p><h1>${escapeHtml(data.student.name)}，時段已確認</h1><p>系統已將以下固定週時段加入排課。如需調整，請直接聯絡老師。</p><div class="booking-confirmed-slots">${selectedSlots.map((slotKey) => `<span>${escapeHtml(formatBookingSlot(slotKey))}</span>`).join("")}</div></section>`;
}

function renderChoiceGroups(slots) {
  const groups = new Map(BOOKING_WEEKDAYS.map((weekday) => [weekday.value, []]));
  slots.forEach((item) => {
    const parsed = parseBookingSlotKey(item.key);
    groups.get(parsed.weekday)?.push({ ...item, ...parsed });
  });
  return [...groups.entries()].filter(([, items]) => items.length).map(([weekday, items]) => {
    const label = BOOKING_WEEKDAYS.find((item) => item.value === weekday)?.label || "";
    return `<fieldset class="booking-choice-group"><legend>${label}</legend><div class="booking-choice-grid">${items.map((item) => `<label class="booking-choice"><input type="checkbox" name="selectedSlots" value="${escapeAttribute(item.key)}"${item.remaining < 1 ? " disabled" : ""} /><span><strong>${escapeHtml(item.slot)}</strong><small>${item.remaining > 0 ? `剩餘 ${item.remaining} 位` : "已額滿"}</small></span></label>`).join("")}</div></fieldset>`;
  }).join("");
}

function renderForm(data) {
  const { campaign, student } = data;
  app.innerHTML = `<section class="booking-public-card"><p class="eyebrow">${escapeHtml(campaign.name)}</p><h1>${escapeHtml(student.name)}的上課時段</h1><p>請選擇每週固定上課時間，送出後將直接確認並加入排課。</p><div class="booking-public-meta"><div><span>學生</span><strong>${escapeHtml(student.name)}・${Number(student.grade)} 年級</strong></div><div><span>上課期間</span><strong>${escapeHtml(campaign.startDate)} 至 ${escapeHtml(campaign.endDate)}</strong></div><div><span>選擇數量</span><strong>${campaign.minChoices} 至 ${campaign.maxChoices} 個時段</strong></div><div><span>填寫截止</span><strong>${escapeHtml(formatDeadline(campaign.registrationDeadline))}</strong></div></div><div class="booking-public-notice">送出後不能自行修改。如需調整，請聯絡老師。</div><form data-public-booking-form><div class="booking-choice-list">${renderChoiceGroups(campaign.slots)}</div><div class="booking-public-submit"><span class="booking-selection-count" data-selection-count>已選擇 0 個時段</span><button class="button-primary" type="submit" disabled>確認並送出</button></div></form></section>`;
  const form = app.querySelector("[data-public-booking-form]");
  const submitButton = form.querySelector('[type="submit"]');
  const count = form.querySelector("[data-selection-count]");
  const updateSelection = () => {
    const selectedCount = form.querySelectorAll('input[name="selectedSlots"]:checked').length;
    count.textContent = `已選擇 ${selectedCount} 個時段（需選 ${campaign.minChoices}–${campaign.maxChoices} 個）`;
    submitButton.disabled = selectedCount < campaign.minChoices || selectedCount > campaign.maxChoices;
    form.querySelectorAll('input[name="selectedSlots"]:not(:checked)').forEach((input) => {
      input.disabled = input.dataset.full === "true" || selectedCount >= campaign.maxChoices;
    });
  };
  form.querySelectorAll('input[name="selectedSlots"]').forEach((input) => {
    input.dataset.full = String(input.disabled);
  });
  form.addEventListener("change", updateSelection);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedSlots = [...form.querySelectorAll('input[name="selectedSlots"]:checked')]
      .map((input) => input.value);
    if (!window.confirm(`確定送出 ${selectedSlots.length} 個固定週時段嗎？送出後需要聯絡老師才能調整。`)) return;
    submitButton.disabled = true;
    submitButton.textContent = "正在確認名額…";
    try {
      const result = await submitSelection({ token, selectedSlots });
      renderConfirmation({
        ...invitationData,
        submission: { selectedSlots: result.data.selectedSlots },
      });
    } catch (error) {
      submitButton.textContent = "確認並送出";
      updateSelection();
      const message = getErrorMessage(error);
      const notice = app.querySelector(".booking-public-notice");
      notice.textContent = message;
      notice.style.background = "#f8e5e5";
      notice.style.color = "var(--danger)";
    }
  });
  updateSelection();
}

async function start() {
  if (!token || token.length > 200) {
    renderError("網址缺少有效的學生專屬代碼。");
    return;
  }
  try {
    const result = await getInvitation({ token });
    invitationData = result.data;
    if (invitationData.invitation.status === "submitted" || invitationData.submission) {
      renderConfirmation(invitationData);
      return;
    }
    if (!invitationData.campaign.isOpen) {
      renderError("這個選課活動尚未開放或已經截止。");
      return;
    }
    renderForm(invitationData);
  } catch (error) {
    renderError(getErrorMessage(error, "目前無法讀取選課活動，請稍後再試。"));
  }
}

start();

