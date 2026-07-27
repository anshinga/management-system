import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { app } from "./app.js";

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

provider.setCustomParameters({ prompt: "select_account" });
