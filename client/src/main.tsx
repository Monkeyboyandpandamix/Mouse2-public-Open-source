import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getFirebaseApp, getFirebaseAnalyticsSafe } from "@/lib/firebase";

// Initialize Firebase early so real-time sync features can attach listeners when enabled.
getFirebaseApp();
void getFirebaseAnalyticsSafe();

createRoot(document.getElementById("root")!).render(<App />);
