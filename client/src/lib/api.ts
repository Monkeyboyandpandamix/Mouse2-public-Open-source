/**
 * Typed API client for key endpoints. Use for consistent request/response handling.
 * Falls back to fetch for endpoints not yet typed.
 */

async function getSessionToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mouse_gcs_session_token");
}

async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["X-Session-Token"] = token;
  if (init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...init?.headers },
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string })?.error || `${res.status}: ${res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

// Missions
export const missionsApi = {
  list: () => apiFetch<{ missions: unknown[] }>("/api/missions"),
  get: (id: string) =>
    apiFetch<{ mission: unknown }>(`/api/missions/${id}`),
  create: (data: unknown) =>
    apiFetch<{ mission: unknown }>("/api/missions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    apiFetch<{ mission: unknown }>(`/api/missions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/missions/${id}`, { method: "DELETE" }),
  execute: (id: string) =>
    apiFetch<{ success: boolean; run?: unknown }>(`/api/missions/${id}/execute`, {
      method: "POST",
    }),
};

// Waypoints
export const waypointsApi = {
  list: (missionId: string) =>
    apiFetch<{ waypoints: unknown[] }>(`/api/missions/${missionId}/waypoints`),
  create: (data: unknown) =>
    apiFetch<{ waypoint: unknown }>("/api/waypoints", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    apiFetch<{ waypoint: unknown }>(`/api/waypoints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/waypoints/${id}`, { method: "DELETE" }),
};

// Commands
export const commandsApi = {
  dispatch: (data: {
    commandType: string;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
    requireConnection?: boolean;
  }) =>
    apiFetch<{ success: boolean; command?: unknown }>("/api/commands/dispatch", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Flight sessions
export const flightSessionsApi = {
  start: (droneId: string) =>
    apiFetch<{ success: boolean; session?: { id: string } }>(
      "/api/flight-sessions/start",
      { method: "POST", body: JSON.stringify({ droneId }) }
    ),
  end: (data: {
    sessionId: string | null;
    droneId: string;
    maxAltitude?: number;
    totalDistance?: number;
    totalFlightTime?: number;
  }) =>
    apiFetch<{ success: boolean }>("/api/flight-sessions/end", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Generic fetch for untyped endpoints
export { apiFetch };
