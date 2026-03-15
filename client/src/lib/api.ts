import { apiRequest as requestResponse } from "./queryClient";

export async function apiRequest<T>(
  method: string,
  url: string,
  data?: any,
): Promise<T> {
  const response = await requestResponse(method, url, data);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// Settings helpers
export const settingsApi = {
  get: async (category: string) => {
    return apiRequest<any[]>("GET", `/api/settings/${category}`);
  },
  
  save: async (key: string, value: any, category: string) => {
    return apiRequest<any>("POST", "/api/settings", { key, value, category });
  },
};

// Missions helpers  
export const missionsApi = {
  getAll: async () => apiRequest<any[]>("GET", "/api/missions"),
  get: async (id: string) => apiRequest<any>("GET", `/api/missions/${id}`),
  create: async (mission: any) => apiRequest<any>("POST", "/api/missions", mission),
  update: async (id: string, mission: any) => apiRequest<any>("PATCH", `/api/missions/${id}`, mission),
  delete: async (id: string) => apiRequest<void>("DELETE", `/api/missions/${id}`),
};

// Waypoints helpers
export const waypointsApi = {
  getByMission: async (missionId: string) => apiRequest<any[]>("GET", `/api/missions/${missionId}/waypoints`),
  create: async (waypoint: any) => apiRequest<any>("POST", "/api/waypoints", waypoint),
  update: async (id: string, waypoint: any) => apiRequest<any>("PATCH", `/api/waypoints/${id}`, waypoint),
  delete: async (id: string) => apiRequest<void>("DELETE", `/api/waypoints/${id}`),
};

// Camera settings helpers
export const cameraApi = {
  get: async () => apiRequest<any>("GET", "/api/camera-settings"),
  update: async (settings: any) => apiRequest<any>("PATCH", "/api/camera-settings", settings),
};
