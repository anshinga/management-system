import {
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  normalizeBookingCampaignInput,
  validateBookingCampaignInput,
} from "../domain/booking.js";
import { functions } from "../firebase/functions.js";
import {
  COLLECTIONS,
  workspaceCollectionRef,
  workspaceDocumentRef,
} from "./firestore-paths.js";

const publishCampaignCallable = httpsCallable(functions, "publishBookingCampaign");
const closeCampaignCallable = httpsCallable(functions, "closeBookingCampaign");
const resetInvitationCallable = httpsCallable(functions, "resetBookingInvitation");
const invitationQrCallable = httpsCallable(functions, "getBookingInvitationQr");

export async function saveBookingCampaign(input, campaignId = "") {
  const campaign = validateBookingCampaignInput(normalizeBookingCampaignInput(input));
  const reference = campaignId
    ? workspaceDocumentRef(COLLECTIONS.bookingCampaigns, campaignId)
    : doc(workspaceCollectionRef(COLLECTIONS.bookingCampaigns));
  const deadline = Timestamp.fromDate(new Date(campaign.registrationDeadline));
  await setDoc(reference, {
    ...campaign,
    registrationDeadline: deadline,
    status: "draft",
    ...(campaignId ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: Boolean(campaignId) });
  return reference.id;
}

export async function publishBookingCampaign(campaignId) {
  const result = await publishCampaignCallable({ campaignId });
  return result.data;
}

export async function closeBookingCampaign(campaignId) {
  const result = await closeCampaignCallable({ campaignId });
  return result.data;
}

export async function resetBookingInvitation(invitationId) {
  const result = await resetInvitationCallable({ invitationId });
  return result.data;
}

export async function getBookingInvitationQr(invitationId, publicUrl) {
  const result = await invitationQrCallable({ invitationId, publicUrl });
  return result.data?.svg || "";
}

export function getBookingPublicUrl(invitationId) {
  const url = new URL("./booking.html", document.baseURI);
  url.searchParams.set("token", invitationId);
  return url.toString();
}

