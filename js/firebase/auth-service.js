import {
  onAuthStateChanged as observeAuthState,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { APP_CONFIG } from "../config.js";
import { auth, provider } from "./auth.js";

export const ALLOWED_EMAIL = APP_CONFIG.ownerEmail;

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isAuthorizedUser(user) {
  return user?.emailVerified === true
    && Boolean(normalizeEmail(user.email));
}

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function subscribeToAuthState(nextOrObserver, onError, onCompletion) {
  return observeAuthState(auth, nextOrObserver, onError, onCompletion);
}
