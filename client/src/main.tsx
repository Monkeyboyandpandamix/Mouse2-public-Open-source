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

// Initialize Firebase early so real-time sync features can attach listeners when enabled.
getFirebaseApp();
void getFirebaseAnalyticsSafe();

createRoot(document.getElementById("root")!).render(<App />);
