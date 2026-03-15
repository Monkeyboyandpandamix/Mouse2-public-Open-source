import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getFirebaseApp, getFirebaseAnalyticsSafe } from "@/lib/firebase";

const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem("mouse_gcs_session_token");
  const reqUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const isApiRequest = reqUrl.startsWith("/api/") || reqUrl.includes("/api/");

  if (!token || !isApiRequest) {
    return originalFetch(input, init);
  }

  const headers = new Headers(init?.headers || {});
  if (!headers.has("X-Session-Token")) {
    headers.set("X-Session-Token", token);
  }

  return originalFetch(input, {
    ...init,
    headers,
  });
};

window.addEventListener("error", (event) => {
  const msg = event.message || "";
  if (
    msg.includes("_leaflet_pos") ||
    msg.includes("_leaflet_id") ||
    msg.includes("Map container") ||
    msg.includes("ResizeObserver loop")
  ) {
    event.preventDefault();
    return;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (
    msg.includes("_leaflet_pos") ||
    msg.includes("_leaflet_id") ||
    msg.includes("ResizeObserver loop")
  ) {
    event.preventDefault();
    return;
  }
});

// Initialize Firebase early so real-time sync features can attach listeners when enabled.
getFirebaseApp();
void getFirebaseAnalyticsSafe();

createRoot(document.getElementById("root")!).render(<App />);
