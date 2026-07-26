import {
  onAuthStateChanged as observeAuthState,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, provider } from "./auth.js";

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
