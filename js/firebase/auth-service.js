import {
  onAuthStateChanged as observeAuthState,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, provider } from "./auth.js";

export const ALLOWED_EMAIL = "anshinga79@gmail.com";

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isAuthorizedUser(user) {
  return user?.emailVerified === true
    && normalizeEmail(user.email) === normalizeEmail(ALLOWED_EMAIL);
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
