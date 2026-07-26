import { getFirestore } from "firebase/firestore";
import { app } from "./app.js";

export const db = getFirestore(app);
