export interface ClientSessionUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  enabled: boolean;
  permissions?: string[];
}

export interface ClientSession {
  user: ClientSessionUser | null;
  isLoggedIn: boolean;
}

export const SESSION_STORAGE_KEY = "mouse_gcs_session";
export const SESSION_TOKEN_STORAGE_KEY = "mouse_gcs_session_token";
export const SELECTED_DRONE_STORAGE_KEY = "mouse_selected_drone";

export function readStoredSession(): ClientSession {
  if (typeof window === "undefined") {
    return { user: null, isLoggedIn: false };
  }
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return { user: null, isLoggedIn: false };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      user: parsed?.user ?? null,
      isLoggedIn: parsed?.isLoggedIn === true,
    };
  } catch {
    return { user: null, isLoggedIn: false };
  }
}

export function writeStoredSession(session: ClientSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  emitSessionEvents(session);
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  emitSessionEvents({ user: null, isLoggedIn: false });
}

export function emitSessionEvents(session: ClientSession): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("session-change", { detail: session }));
  window.dispatchEvent(new CustomEvent("session-updated", { detail: session }));
}

export function readStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
}

export function writeStoredSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
}

export function readStoredSelectedDrone<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SELECTED_DRONE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStoredSelectedDrone(drone: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SELECTED_DRONE_STORAGE_KEY, JSON.stringify(drone));
  window.dispatchEvent(new CustomEvent("drone-selected", { detail: drone }));
}

export function clearStoredSelectedDrone(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SELECTED_DRONE_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("drone-selected", { detail: null }));
}
