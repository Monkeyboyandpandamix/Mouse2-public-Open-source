import { getSession, getSessionMap, deleteSession } from "../sessionStore";
import type { ServerSession } from "../sessionStore";
import { ROLE_PERMISSIONS, type PermissionId } from "@shared/permissions";

/** Paths that bypass auth. /api/health is intentionally unauthenticated for load balancers and Electron startup. */
export const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/google/callback",
  "/api/runtime-config",
]);

/** Async session validation using shared store (Firestore/file on cache miss) for multi-instance support. */
export async function validateSessionAsync(token: string | undefined): Promise<ServerSession | null> {
  if (!token) return null;
  return getSession(token);
}

/** @deprecated Use validateSessionAsync for request-time auth. Sync check only hits memory cache. */
export function validateSession(token: string | undefined): ServerSession | null {
  if (!token) return null;
  const session = getSessionMap().get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    void deleteSession(token);
    return null;
  }
  return session;
}

export function requestSession(req: any): ServerSession | null {
  return (req as any).serverSession ?? null;
}

export function hasServerPermission(session: ServerSession | null, permission: PermissionId): boolean {
  if (!session) return false;
  const role = String(session.role || "viewer").toLowerCase();
  if (role === "admin") return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

/** Async auth middleware: validates session via shared store (Firestore/file) for multi-instance support. */
export function requireAuth(req: any, res: any, next: any): void {
  const token = req?.headers?.["x-session-token"];
  const normalizedToken = typeof token === "string" ? token : Array.isArray(token) ? token[0] : undefined;
  getSession(normalizedToken)
    .then((session) => {
      if (!session) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }
      req.serverSession = session;
      next();
    })
    .catch((err) => next(err));
}

export function requirePermission(permission: PermissionId) {
  return (req: any, res: any, next: any) => {
    const token = req?.headers?.["x-session-token"];
    const normalizedToken = typeof token === "string" ? token : Array.isArray(token) ? token[0] : undefined;
    getSession(normalizedToken)
      .then((session) => {
        if (!session) {
          res.status(401).json({ success: false, error: "Authentication required" });
          return;
        }
        if (!hasServerPermission(session, permission)) {
          res.status(403).json({ success: false, error: "Insufficient permissions" });
          return;
        }
        req.serverSession = session;
        next();
      })
      .catch((err) => next(err));
  };
}

export function apiPermissionForRequest(apiPath: string, method: string, body?: any): PermissionId | null {
  const normalizedPath = String(apiPath || "").trim();
  const normalizedMethod = String(method || "GET").toUpperCase();
  const isWrite = normalizedMethod !== "GET" && normalizedMethod !== "HEAD";

  if (normalizedPath.startsWith("/api/admin/")) return "user_management";
  if (normalizedPath === "/api/groups") return null;
  if (normalizedPath === "/api/messages/history" || normalizedPath === "/api/messages/sync") return "user_management";
  if (normalizedPath.startsWith("/api/messages") || normalizedPath === "/api/chat-users") return null;

  if (normalizedPath.startsWith("/api/audio/")) return "broadcast_audio";
  if (normalizedPath.startsWith("/api/mapping/3d/")) return isWrite ? "system_settings" : "view_map";
  if (normalizedPath === "/api/mavlink/command") return "camera_control";
  if (normalizedPath.startsWith("/api/mavlink/fence/")) return "manage_geofences";
  if (normalizedPath.startsWith("/api/mavlink/mission/")) return "mission_planning";
  if (normalizedPath.startsWith("/api/mavlink/rally/")) return "mission_planning";
  if (normalizedPath.startsWith("/api/mavlink/mode-mapping")) return "system_settings";
  if (normalizedPath.startsWith("/api/mavlink/airframe/")) return "system_settings";
  if (normalizedPath.startsWith("/api/mavlink/optional-hardware/")) return "system_settings";
  if (normalizedPath.startsWith("/api/mavlink/manual-control")) return "flight_control";
  if (normalizedPath.startsWith("/api/mavlink/vehicle/action")) {
    return normalizedPath.includes("arm") || normalizedPath.includes("disarm") ? "arm_disarm" : "flight_control";
  }
  if (
    normalizedPath.startsWith("/api/mavlink/params") ||
    normalizedPath.startsWith("/api/mavlink/calibration") ||
    normalizedPath.startsWith("/api/mavlink/swarm/") ||
    normalizedPath.startsWith("/api/mavlink/radio-sik/") ||
    normalizedPath.startsWith("/api/mavlink/inspector/") ||
    normalizedPath.startsWith("/api/mavlink/serial-passthrough/") ||
    normalizedPath.startsWith("/api/mavlink/rtk/") ||
    normalizedPath.startsWith("/api/mavlink/gps-inject/") ||
    normalizedPath.startsWith("/api/mavlink/dataflash/") ||
    normalizedPath.startsWith("/api/mavlink/geotag/")
  ) {
    return normalizedPath.startsWith("/api/mavlink/dataflash/") ? "access_flight_recorder" : "system_settings";
  }

  if (normalizedPath === "/api/commands/dispatch") {
    const commandType = String(body?.commandType || body?.type || "").trim().toLowerCase();
    if (commandType === "arm" || commandType === "disarm") return "arm_disarm";
    if (commandType === "terminal" || commandType === "terminal_command" || commandType === "run_terminal") return "run_terminal";
    return "flight_control";
  }
  if (normalizedPath.startsWith("/api/commands")) return null;
  if (normalizedPath.startsWith("/api/missions")) return isWrite ? "mission_planning" : "mission_planning";
  if (normalizedPath.startsWith("/api/waypoints")) return isWrite ? "mission_planning" : "mission_planning";
  if (normalizedPath.startsWith("/api/flight-logs")) return normalizedMethod === "DELETE" ? "delete_records" : "access_flight_recorder";
  if (normalizedPath.startsWith("/api/flight-sessions")) {
    if (normalizedMethod === "DELETE") return "delete_records";
    return "access_flight_recorder";
  }
  if (normalizedPath.startsWith("/api/motor-telemetry") || normalizedPath.startsWith("/api/sensor-data")) {
    return normalizedMethod === "GET" ? "view_telemetry" : "system_settings";
  }
  if (normalizedPath.startsWith("/api/telemetry/record")) return "system_settings";
  if (normalizedPath.startsWith("/api/camera-settings")) return normalizedMethod === "GET" ? "view_camera" : "camera_control";
  if (normalizedPath.startsWith("/api/airspace/") || normalizedPath.startsWith("/api/geocode") || normalizedPath.startsWith("/api/reverse-geocode")) {
    return "view_map";
  }
  if (
    normalizedPath.startsWith("/api/backup/") ||
    normalizedPath.startsWith("/api/drive/") ||
    normalizedPath.startsWith("/api/google/") ||
    normalizedPath.startsWith("/api/cloud/") ||
    normalizedPath.startsWith("/api/debug/") ||
    normalizedPath.startsWith("/api/connections/test") ||
    normalizedPath.startsWith("/api/integrations/verify")
  ) {
    return "system_settings";
  }
  if (normalizedPath.startsWith("/api/drones")) return isWrite ? "system_settings" : "view_map";
  if (normalizedPath.startsWith("/api/media")) return normalizedMethod === "GET" ? "view_camera" : "camera_control";
  if (normalizedPath.startsWith("/api/backlog")) return "system_settings";
  if (normalizedPath.startsWith("/api/servo/")) return "camera_control";
  if (normalizedPath.startsWith("/api/bme688/")) return "view_telemetry";
  if (normalizedPath.startsWith("/api/stabilization/")) return isWrite ? "flight_control" : "view_telemetry";
  if (normalizedPath.startsWith("/api/settings")) return "system_settings";
  if (normalizedPath.startsWith("/api/plugins/")) return "system_settings";
  if (normalizedPath.startsWith("/api/automation/")) return "automation_scripts";
  if (normalizedPath.startsWith("/api/operator/")) return "view_map";
  if (normalizedPath.startsWith("/api/auth/")) return null;
  return null;
}
