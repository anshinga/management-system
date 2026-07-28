import { getFunctions } from "firebase/functions";
import { app } from "./app.js";

export const functions = getFunctions(app, "asia-east1");

