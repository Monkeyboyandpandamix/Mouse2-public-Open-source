import { queryClient } from "./queryClient";

export async function apiRequest<T>(
  method: string,
  url: string,
  data?: any
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
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
  get: async (id: number) => apiRequest<any>("GET", `/api/missions/${id}`),
  create: async (mission: any) => apiRequest<any>("POST", "/api/missions", mission),
  update: async (id: number, mission: any) => apiRequest<any>("PATCH", `/api/missions/${id}`, mission),
  delete: async (id: number) => apiRequest<void>("DELETE", `/api/missions/${id}`),
};

// Waypoints helpers
export const waypointsApi = {
  getByMission: async (missionId: number) => apiRequest<any[]>("GET", `/api/missions/${missionId}/waypoints`),
  create: async (waypoint: any) => apiRequest<any>("POST", "/api/waypoints", waypoint),
  update: async (id: number, waypoint: any) => apiRequest<any>("PATCH", `/api/waypoints/${id}`, waypoint),
  delete: async (id: number) => apiRequest<void>("DELETE", `/api/waypoints/${id}`),
};

// Camera settings helpers
export const cameraApi = {
  get: async () => apiRequest<any>("GET", "/api/camera-settings"),
  update: async (settings: any) => apiRequest<any>("PATCH", "/api/camera-settings", settings),
};
