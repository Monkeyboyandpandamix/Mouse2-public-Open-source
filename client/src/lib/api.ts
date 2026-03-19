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

// Missions (GET /api/missions returns array directly)
export const missionsApi = {
  list: () => apiFetch<unknown[]>("/api/missions"),
  get: (id: string) =>
    apiFetch<unknown>(`/api/missions/${id}`),
  create: (data: unknown) =>
    apiFetch<unknown>("/api/missions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/api/missions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/missions/${id}`, { method: "DELETE" }),
  execute: (id: string, options?: { connectionString?: string; armBeforeStart?: boolean; routePolicy?: unknown }) =>
    apiFetch<{ success: boolean; run?: { id: string; status?: string; error?: string } }>(`/api/missions/${id}/execute`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),
  stopRun: (runId: string) =>
    apiFetch<{ success: boolean; run?: unknown }>(`/api/missions/runs/${runId}/stop`, {
      method: "POST",
    }),
  getRun: (runId: string) =>
    apiFetch<{ success: boolean; run?: { id: string; status?: string; error?: string } }>(`/api/missions/runs/${runId}`),
};

// Waypoints (GET /api/missions/:id/waypoints returns array directly)
export const waypointsApi = {
  list: (missionId: string) =>
    apiFetch<unknown[]>(`/api/missions/${missionId}/waypoints`),
  create: (data: unknown) =>
    apiFetch<unknown>("/api/waypoints", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/api/waypoints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/waypoints/${id}`, { method: "DELETE" }),
};

// Operator preferences (backend-owned selected drone)
export const operatorPreferencesApi = {
  get: () =>
    apiFetch<{ selectedDroneId: string | null; cameraSettings?: Record<string, unknown> | null }>(
      "/api/operator/preferences"
    ),
  update: (data: { selectedDroneId?: string | null }) =>
    apiFetch<{ selectedDroneId: string | null; cameraSettings?: Record<string, unknown> | null }>(
      "/api/operator/preferences",
      { method: "PATCH", body: JSON.stringify(data) }
    ),
};

// Drones (GET /api/drones returns array directly)
export const dronesApi = {
  list: () => apiFetch<unknown[]>("/api/drones"),
  get: (id: string) =>
    apiFetch<unknown>(`/api/drones/${id}`),
  create: (data: unknown) =>
    apiFetch<unknown>("/api/drones", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    apiFetch<unknown>(`/api/drones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/drones/${id}`, { method: "DELETE" }),
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
  getLease: (connectionString: string) =>
    apiFetch<{
      lease: { heldBy: string; acquiredAt: number; expiresInMs: number } | null;
      currentUserId: string;
      hasLease: boolean;
    }>(`/api/commands/lease?connectionString=${encodeURIComponent(connectionString)}`),
};

// Flight sessions
export const flightSessionsApi = {
  list: () => apiFetch<unknown[]>("/api/flight-sessions"),
  getActive: (droneId: string) =>
    apiFetch<{ session?: { id: string; startTime: string } }>(
      `/api/flight-sessions/active?droneId=${encodeURIComponent(droneId)}`
    ),
  getLogs: (sessionId: string) =>
    apiFetch<unknown[]>(`/api/flight-sessions/${sessionId}/logs`),
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
  update: (id: string, updates: Record<string, unknown>) =>
    apiFetch<unknown>(`/api/flight-sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/flight-sessions/${id}`, { method: "DELETE" }),
};

// Generic fetch for untyped endpoints
export { apiFetch };
