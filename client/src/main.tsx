import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getFirebaseApp, getFirebaseAnalyticsSafe } from "@/lib/firebase";

const SUPPRESSED_PATTERNS = [
  "_leaflet_pos",
  "_leaflet_id",
  "ResizeObserver loop",
  "ResizeObserver loop limit exceeded",
  "Cannot read properties of null (reading '_leaflet_pos')",
  "Cannot read properties of undefined (reading '_leaflet_id')",
  "_getMapPanePos",
];

function isSuppressedError(msg: string): boolean {
  return SUPPRESSED_PATTERNS.some((p) => msg.includes(p));
}

window.onerror = (message, _source, _lineno, _colno, _error) => {
  const msg = String(message);
  if (isSuppressedError(msg)) {
    return true;
  }
  console.error("[runtime.error]", { message: msg, source: _source, line: _lineno, col: _colno, error: _error });
  return false;
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (isSuppressedError(msg)) {
    event.preventDefault();
    return;
  }
  console.error("[runtime.rejection]", { message: msg, reason: event.reason });
};

window.addEventListener("error", (event) => {
  const msg = String(event.message || event.error?.message || "");
  if (isSuppressedError(msg)) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }
  console.error("[runtime.error.event]", { message: msg, error: event.error });
}, true);

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (isSuppressedError(msg)) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }
  console.error("[runtime.rejection.event]", { message: msg, reason: event.reason });
}, true);

const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem("mouse_gcs_session_token");
  const reqUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  // Only inject token for same-origin relative API paths to prevent token exfiltration
  const isApiRequest = reqUrl.startsWith("/api/") && !reqUrl.startsWith("http");

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

async function hydrateSessionFromServer() {
  const token = localStorage.getItem("mouse_gcs_session_token");
  if (!token) {
    localStorage.removeItem("mouse_gcs_session");
    window.dispatchEvent(new CustomEvent("session-change", { detail: { user: null, isLoggedIn: false } }));
    window.dispatchEvent(new CustomEvent("session-updated", { detail: { user: null, isLoggedIn: false } }));
    return;
  }

  try {
    const response = await originalFetch("/api/auth/session", {
      method: "GET",
      headers: { "X-Session-Token": token },
    });
    if (!response.ok) {
      throw new Error(`session check failed (${response.status})`);
    }
    const data = await response.json();
    if (!data?.success || !data?.user) {
      throw new Error("invalid session response");
    }
    const session = {
      user: {
        id: data.user.id,
        username: data.user.username,
        fullName: data.user.fullName || data.user.username,
        role: data.user.role,
        enabled: data.user.enabled !== false,
      },
      isLoggedIn: true,
    };
    localStorage.setItem("mouse_gcs_session", JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("session-change", { detail: session }));
    window.dispatchEvent(new CustomEvent("session-updated", { detail: session }));
  } catch {
    localStorage.removeItem("mouse_gcs_session");
    localStorage.removeItem("mouse_gcs_session_token");
    window.dispatchEvent(new CustomEvent("session-change", { detail: { user: null, isLoggedIn: false } }));
    window.dispatchEvent(new CustomEvent("session-updated", { detail: { user: null, isLoggedIn: false } }));
  }
}

// Initialize Firebase early so real-time sync features can attach listeners when enabled.
getFirebaseApp();
void getFirebaseAnalyticsSafe();
void hydrateSessionFromServer();

createRoot(document.getElementById("root")!).render(<App />);
