import {
  BOOKING_CAPACITY,
  BOOKING_WEEKDAYS,
  formatBookingSlot,
  getBookingCampaignStatusLabel,
  makeBookingSlotKey,
} from "../domain/booking.js";
import {
  closeBookingCampaign,
  getBookingInvitationQr,
  getBookingPublicUrl,
  publishBookingCampaign,
  resetBookingInvitation,
  saveBookingCampaign,
} from "../repositories/booking-repository.js";
import { getScheduleSlotsForWeekday } from "../domain/schedule.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

let campaignFormOpen = false;
let editingCampaignId = "";
let expandedCampaignId = "";

function timestampToDate(value) {
  if (value?.toDate) return value.toDate();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDateTime(value) {
  const date = timestampToDate(value);
  if (!date) return "尚未設定";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTimeInput(value) {
  const date = timestampToDate(value);
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusClass(status) {
  return status === "open" ? "active" : status === "closed" ? "paused" : "";
}

export function renderSlotOptions(selectedSlots = [], season) {
  const selected = new Set(selectedSlots);
  const availableWeekdays = BOOKING_WEEKDAYS
    .map((weekday) => ({
      ...weekday,
      slots: getScheduleSlotsForWeekday(season, weekday.value),
    }))
    .filter((weekday) => weekday.slots.length);
  return `<div class="booking-slot-settings">${availableWeekdays.map((weekday) => `
    <fieldset class="booking-weekday-group">
      <legend>${weekday.label}</legend>
      ${weekday.slots.map((slot) => {
        const key = makeBookingSlotKey(weekday.value, slot);
        return `<label class="booking-slot-check"><input type="checkbox" name="availableSlots" value="${escapeAttribute(key)}"${selected.has(key) ? " checked" : ""} /><span>${slot}</span></label>`;
      }).join("")}
    </fieldset>`).join("")}</div>`;
}

function renderCampaignForm(state) {
  if (!campaignFormOpen) return "";
  const campaign = state.bookingCampaigns.find((item) => item.id === editingCampaignId);
  const defaultSeason = state.seasons.find((season) => season.active) || state.seasons[0];
  const season = campaign
    ? state.seasons.find((item) => item.id === campaign.seasonId)
    : defaultSeason;
  const values = campaign || {
    name: season ? `${season.name}時段登記` : "",
    seasonId: season?.id || "",
    startDate: season?.startDate || "",
    endDate: season?.endDate || "",
    registrationDeadline: "",
    minChoices: 1,
    maxChoices: 3,
    availableSlots: [],
    excludedDates: [],
  };
  return `<section class="panel booking-campaign-editor">
    <div class="panel-head">
      <div><p class="eyebrow">${campaign ? "編輯草稿" : "建立活動"}</p><h3>${campaign ? escapeHtml(campaign.name) : "新的選課活動"}</h3></div>
      <button class="button-secondary" data-action="cancel-booking-campaign" type="button">取消</button>
    </div>
    <form data-booking-campaign-form data-campaign-id="${escapeAttribute(campaign?.id || "")}">
      <div class="booking-form-grid">
        <div class="field field-wide"><label for="booking-name">活動名稱</label><input class="input" id="booking-name" name="name" maxlength="100" required value="${escapeAttribute(values.name)}" /></div>
        <div class="field"><label for="booking-season">對應時期</label><select class="select" id="booking-season" name="seasonId" required>${state.seasons.map((item) => `<option value="${escapeAttribute(item.id)}" data-start="${escapeAttribute(item.startDate)}" data-end="${escapeAttribute(item.endDate)}"${item.id === values.seasonId ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="booking-start-date">上課開始日期</label><input class="input" id="booking-start-date" name="startDate" type="date" required value="${escapeAttribute(values.startDate)}" /></div>
        <div class="field"><label for="booking-end-date">上課結束日期</label><input class="input" id="booking-end-date" name="endDate" type="date" required value="${escapeAttribute(values.endDate)}" /></div>
        <div class="field"><label for="booking-deadline">家長填寫截止</label><input class="input" id="booking-deadline" name="registrationDeadline" type="datetime-local" required value="${escapeAttribute(formatDateTimeInput(values.registrationDeadline))}" /></div>
        <div class="field"><label for="booking-min">最少選擇</label><input class="input" id="booking-min" name="minChoices" type="number" min="1" max="24" required value="${Number(values.minChoices || 1)}" /></div>
        <div class="field"><label for="booking-max">最多選擇</label><input class="input" id="booking-max" name="maxChoices" type="number" min="1" max="12" required value="${Number(values.maxChoices || 1)}" /></div>
        <div class="field"><label>每時段上限</label><input class="input" disabled value="${BOOKING_CAPACITY} 位學生" /></div>
        <div class="field field-wide"><label for="booking-excluded-dates">停課日期</label><textarea class="input" id="booking-excluded-dates" name="excludedDates" rows="2" placeholder="例如：2026-08-08, 2026-08-15">${escapeHtml((values.excludedDates || []).join(", "))}</textarea><small>可用逗號或空格分隔，日期必須位於上課區間內。</small></div>
      </div>
      <div class="booking-slot-section"><div><h4>家長可選的固定週時段</h4><p class="student-subtitle">勾選本次活動開放的星期與時間。</p></div><div data-booking-slot-options>${renderSlotOptions(values.availableSlots, season)}</div></div>
      <div class="form-actions booking-form-actions"><button class="button-primary" type="submit">${campaign ? "儲存草稿" : "建立草稿"}</button></div>
    </form>
  </section>`;
}

function getCampaignInvitations(state, campaignId) {
  return state.bookingInvitations
    .filter((item) => item.campaignId === campaignId)
    .sort((a, b) => {
      const studentA = state.students.find((student) => student.id === a.studentId);
      const studentB = state.students.find((student) => student.id === b.studentId);
      return Number(studentA?.grade || 0) - Number(studentB?.grade || 0)
        || String(studentA?.name || "").localeCompare(String(studentB?.name || ""), "zh-Hant");
    });
}

function renderInvitationList(state, campaign) {
  if (expandedCampaignId !== campaign.id) return "";
  const invitations = getCampaignInvitations(state, campaign.id);
  const submissions = new Map(state.bookingSubmissions.map((item) => [item.id, item]));
  return `<div class="booking-invitation-panel">
    <div class="booking-invitation-head"><div><h4>學生專屬連結</h4><p class="student-subtitle">已送出後連結會鎖定；需要重填時可由管理者重設。</p></div><span>${invitations.filter((item) => item.status === "submitted").length} / ${invitations.length} 已送出</span></div>
    ${invitations.length ? `<div class="booking-invitation-list">${invitations.map((invitation) => {
      const student = state.students.find((item) => item.id === invitation.studentId);
      const submission = submissions.get(invitation.id);
      const url = getBookingPublicUrl(invitation.id);
      return `<article class="booking-invitation-row">
        <div><strong>${escapeHtml(student?.name || "未知學生")}</strong><small>${student?.grade || "–"} 年級・${invitation.status === "submitted" ? "已送出" : "未送出"}</small>${submission?.selectedSlots?.length ? `<small>${submission.selectedSlots.map(formatBookingSlot).join("、")}</small>` : ""}</div>
        <div class="booking-invitation-actions">
          <button class="button-secondary" data-action="copy-booking-link" data-url="${escapeAttribute(url)}" type="button">複製連結</button>
          <button class="button-secondary" data-action="show-booking-qr" data-invitation-id="${escapeAttribute(invitation.id)}" data-url="${escapeAttribute(url)}" data-student-name="${escapeAttribute(student?.name || "")}" type="button">QR Code</button>
          ${invitation.status === "submitted" ? `<button class="button-danger" data-action="reset-booking-invitation" data-invitation-id="${escapeAttribute(invitation.id)}" data-student-name="${escapeAttribute(student?.name || "")}" type="button">重設填寫</button>` : ""}
        </div>
      </article>`;
    }).join("")}</div>` : '<div class="empty">尚未產生學生連結。</div>'}
  </div>`;
}

function renderCampaignCard(state, campaign) {
  const invitations = getCampaignInvitations(state, campaign.id);
  const submittedCount = invitations.filter((item) => item.status === "submitted").length;
  const slotSummary = (campaign.availableSlots || []).map(formatBookingSlot);
  return `<article class="booking-campaign-card">
    <div class="booking-campaign-summary">
      <div><div class="card-title"><h3>${escapeHtml(campaign.name)}</h3><span class="status-badge ${statusClass(campaign.status)}">${getBookingCampaignStatusLabel(campaign.status)}</span></div><p>${escapeHtml(campaign.startDate)} 至 ${escapeHtml(campaign.endDate)}・截止 ${escapeHtml(formatDateTime(campaign.registrationDeadline))}</p></div>
      <div class="booking-campaign-actions">
        ${campaign.status === "draft" ? `<button class="button-secondary" data-action="edit-booking-campaign" data-campaign-id="${escapeAttribute(campaign.id)}" type="button">編輯</button><button class="button-primary" data-action="publish-booking-campaign" data-campaign-id="${escapeAttribute(campaign.id)}" type="button">開放活動</button>` : ""}
        ${campaign.status === "open" ? `<button class="button-secondary" data-action="publish-booking-campaign" data-campaign-id="${escapeAttribute(campaign.id)}" type="button">補建學生連結</button><button class="button-danger" data-action="close-booking-campaign" data-campaign-id="${escapeAttribute(campaign.id)}" type="button">提前截止</button>` : ""}
        ${campaign.status !== "draft" ? `<button class="button-secondary" data-action="toggle-booking-invitations" data-campaign-id="${escapeAttribute(campaign.id)}" type="button">${expandedCampaignId === campaign.id ? "收起連結" : "查看連結"}</button>` : ""}
      </div>
    </div>
    <div class="booking-campaign-meta"><span>每人 ${campaign.minChoices}–${campaign.maxChoices} 個時段</span><span>每時段 ${campaign.capacity || BOOKING_CAPACITY} 人</span><span>${submittedCount} / ${invitations.length} 已送出</span></div>
    <div class="booking-campaign-slots">${slotSummary.map((slot) => `<span>${escapeHtml(slot)}</span>`).join("")}</div>
    ${renderInvitationList(state, campaign)}
  </article>`;
}

export function renderBookingCampaigns(state) {
  if (state.booking?.available === false) {
    return `<div class="page-head"><div><p class="eyebrow">家長時段登記</p><h2>選課活動</h2></div></div>
      <section class="panel empty"><strong>選課功能尚未連上 Firebase</strong><p>原本的點名、學生、排課、紀錄與繳費功能仍可正常使用。請部署最新的 Firestore Rules 與 Cloud Functions 後重新整理頁面。</p></section>`;
  }
  const campaigns = [...state.bookingCampaigns].sort((a, b) => {
    const order = { open: 0, draft: 1, closed: 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
      || String(b.startDate || "").localeCompare(String(a.startDate || ""));
  });
  return `<div class="page-head"><div><p class="eyebrow">家長時段登記</p><h2>選課活動</h2><p>建立每個時期的固定週時段登記，確認後自動同步至排課。</p></div><button class="button-primary" data-action="new-booking-campaign" type="button">建立活動</button></div>
    ${renderCampaignForm(state)}
    <div class="booking-campaign-list">${campaigns.length ? campaigns.map((campaign) => renderCampaignCard(state, campaign)).join("") : '<div class="panel empty">目前還沒有選課活動。</div>'}</div>`;
}

function openQrModal(app, studentName, svg) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal booking-qr-modal" role="dialog" aria-modal="true" aria-labelledby="booking-qr-title"><div class="modal-head"><div><p class="eyebrow">學生專屬連結</p><h3 id="booking-qr-title">${escapeHtml(studentName)}的 QR Code</h3></div><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="booking-qr-image">${svg}</div><p class="student-subtitle">請只將這個 QR Code 傳給對應學生的家長。</p></section>`;
  app.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close-modal]").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
}

export function bindBookingCampaigns(app, state, refresh, showToast) {
  app.querySelector('[data-action="new-booking-campaign"]')?.addEventListener("click", () => {
    campaignFormOpen = true;
    editingCampaignId = "";
    refresh();
  });
  app.querySelector('[data-action="cancel-booking-campaign"]')?.addEventListener("click", () => {
    campaignFormOpen = false;
    editingCampaignId = "";
    refresh();
  });
  app.querySelector("#booking-season")?.addEventListener("change", (event) => {
    const option = event.target.selectedOptions[0];
    const season = state.seasons.find((item) => item.id === event.target.value);
    const form = event.target.form;
    const slotOptions = form.querySelector("[data-booking-slot-options]");
    if (slotOptions) slotOptions.innerHTML = renderSlotOptions([], season);
    if (!editingCampaignId) {
      form.elements.startDate.value = option?.dataset.start || "";
      form.elements.endDate.value = option?.dataset.end || "";
      if (season) form.elements.name.value = `${season.name}時段登記`;
    }
  });
  app.querySelector("[data-booking-campaign-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const formData = new FormData(form);
    submitButton.disabled = true;
    try {
      await saveBookingCampaign({
        name: formData.get("name"),
        seasonId: formData.get("seasonId"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        registrationDeadline: formData.get("registrationDeadline"),
        minChoices: formData.get("minChoices"),
        maxChoices: formData.get("maxChoices"),
        availableSlots: formData.getAll("availableSlots"),
        excludedDates: formData.get("excludedDates"),
      }, form.dataset.campaignId);
      campaignFormOpen = false;
      editingCampaignId = "";
      showToast("選課活動草稿已儲存");
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "無法儲存選課活動"));
    }
  });
  app.querySelectorAll('[data-action="edit-booking-campaign"]').forEach((button) => {
    button.addEventListener("click", () => {
      campaignFormOpen = true;
      editingCampaignId = button.dataset.campaignId;
      refresh();
    });
  });
  app.querySelectorAll('[data-action="publish-booking-campaign"]').forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await publishBookingCampaign(button.dataset.campaignId);
        showToast(`活動已開放，新增 ${result.createdInvitations || 0} 個學生連結`);
      } catch (error) {
        button.disabled = false;
        showToast(getUserErrorMessage(error, "無法開放選課活動"));
      }
    });
  });
  app.querySelectorAll('[data-action="close-booking-campaign"]').forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("確定要提前截止這個活動嗎？尚未送出的家長將無法再填寫。")) return;
      button.disabled = true;
      try {
        await closeBookingCampaign(button.dataset.campaignId);
        showToast("選課活動已截止");
      } catch (error) {
        button.disabled = false;
        showToast(getUserErrorMessage(error, "無法截止選課活動"));
      }
    });
  });
  app.querySelectorAll('[data-action="toggle-booking-invitations"]').forEach((button) => {
    button.addEventListener("click", () => {
      expandedCampaignId = expandedCampaignId === button.dataset.campaignId ? "" : button.dataset.campaignId;
      refresh();
    });
  });
  app.querySelectorAll('[data-action="copy-booking-link"]').forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.url);
        showToast("學生專屬連結已複製");
      } catch {
        showToast("瀏覽器無法自動複製，請改用 QR Code");
      }
    });
  });
  app.querySelectorAll('[data-action="show-booking-qr"]').forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const svg = await getBookingInvitationQr(
          button.dataset.invitationId,
          button.dataset.url,
        );
        openQrModal(app, button.dataset.studentName, svg);
      } catch (error) {
        showToast(getUserErrorMessage(error, "無法產生 QR Code"));
      } finally {
        button.disabled = false;
      }
    });
  });
  app.querySelectorAll('[data-action="reset-booking-invitation"]').forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm(`確定要重設 ${button.dataset.studentName} 的選擇嗎？系統會移除本次活動自動建立、且尚未點名的排課。`)) return;
      button.disabled = true;
      try {
        await resetBookingInvitation(button.dataset.invitationId);
        showToast("學生連結已重新開放填寫");
      } catch (error) {
        button.disabled = false;
        showToast(getUserErrorMessage(error, "無法重設學生選擇"));
      }
    });
  });
}
