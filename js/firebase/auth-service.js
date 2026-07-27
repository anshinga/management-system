import {
  onAuthStateChanged as observeAuthState,
  GoogleAuthProvider,
  signInWithCredential,
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
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
    const mockGoogleIdToken = JSON.stringify({
      sub: "local-owner",
      email: APP_CONFIG.ownerEmail,
      email_verified: true,
      name: "本機測試管理員",
    });
    return signInWithCredential(auth, GoogleAuthProvider.credential(mockGoogleIdToken));
  }
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
