export { app } from "./app.js";
export { auth, provider } from "./auth.js";
export {
  ALLOWED_EMAIL,
  getCurrentUser,
  isAuthorizedUser,
  signInWithGoogle,
  signOut,
  subscribeToAuthState,
} from "./auth-service.js";
export { db } from "./firestore.js";
