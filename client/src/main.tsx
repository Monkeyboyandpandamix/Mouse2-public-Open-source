import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getFirebaseApp, getFirebaseAnalyticsSafe } from "@/lib/firebase";

const SUPPRESSED_PATTERNS = [
  "_leaflet_pos",
  "_leaflet_id",
  "Map container",
  "ResizeObserver loop",
  "leaflet",
  "getPosition",
  "_getMapPanePos",
];

function isSuppressedError(msg: string): boolean {
  return SUPPRESSED_PATTERNS.some((p) => msg.includes(p));
}

window.onerror = (message, _source, _lineno, _colno, _error) => {
  if (isSuppressedError(String(message))) {
    return true;
  }
  return false;
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (isSuppressedError(msg)) {
    event.preventDefault();
    return;
  }
};

window.addEventListener("error", (event) => {
  const msg = String(event.message || event.error?.message || "");
  if (isSuppressedError(msg)) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }
}, true);

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (isSuppressedError(msg)) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }
}, true);

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

function ensureWebSessionBootstrap() {
  const existingSession = localStorage.getItem("mouse_gcs_session");
  if (existingSession) return;

  const bootstrapSession = {
    user: {
      id: "operator1",
      username: "operator1",
      fullName: "Operator 1",
      role: "operator",
      enabled: true,
    },
    isLoggedIn: true,
  };

  localStorage.setItem("mouse_gcs_session", JSON.stringify(bootstrapSession));
  window.dispatchEvent(new CustomEvent("session-change", { detail: bootstrapSession }));
  window.dispatchEvent(new CustomEvent("session-updated", { detail: bootstrapSession }));

  // Best-effort server session token for protected endpoints.
  void originalFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: bootstrapSession.user.id,
      username: bootstrapSession.user.username,
      role: bootstrapSession.user.role,
      name: bootstrapSession.user.fullName,
    }),
  })
    .then(async (res) => {
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.sessionToken) {
        localStorage.setItem("mouse_gcs_session_token", data.sessionToken);
      }
    })
    .catch(() => {});
}

// Initialize Firebase early so real-time sync features can attach listeners when enabled.
getFirebaseApp();
void getFirebaseAnalyticsSafe();
ensureWebSessionBootstrap();

createRoot(document.getElementById("root")!).render(<App />);
