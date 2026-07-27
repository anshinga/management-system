import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { app } from "./app.js";

export const db = getFirestore(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
