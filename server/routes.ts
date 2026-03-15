import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { readFile, writeFile, readdir } from "fs/promises";
import path from "path";
import os from "os";
import net from "net";
import { flightDynamicsEngine } from "./flightDynamics";

// Use system Python to ensure Adafruit libraries are available
// On Raspberry Pi, venv may not have the hardware libraries but system Python does
const PYTHON_EXEC = process.env.PYTHON_PATH ?? "/usr/bin/python3";

// Get absolute path to scripts directory (works regardless of cwd)
const SCRIPTS_DIR = path.resolve(process.cwd(), "scripts");
import {
  insertSettingsSchema,
  insertMissionSchema,
  insertWaypointSchema,
  insertFlightSessionSchema,
  insertFlightLogSchema,
  insertSensorDataSchema,
  insertMotorTelemetrySchema,
  insertCameraSettingsSchema,
  insertDroneSchema,
  insertMediaAssetSchema,
  insertOfflineBacklogSchema,
  insertBme688ReadingSchema,
} from "@shared/schema";
import { ZodError } from "zod";
import { fromError } from "zod-validation-error";
import { syncDataToSheets, getOrCreateBackupSpreadsheet, getSpreadsheetUrl } from "./googleSheets";
import { uploadFileToDrive, listDriveFiles, checkDriveConnection, deleteFileFromDrive } from "./googleDrive";
import {
  appendCloudDocument,
  cloudSyncEnabled,
  deleteCloudDocument,
  getRecentCloudDocs,
  publishCloudRealtime,
  syncCloudDocument,
  uploadCloudStorageObject,
} from "./cloudSync";
import { getFirebaseAdminDb, getFirebaseAdminRtdb, getFirebaseAdminStorage, resetFirebaseAdminApp } from "./firebaseAdmin";
import { HARDCODED_FIREBASE_PROJECT } from "@shared/hardcodedFirebaseConfig";
import { 
  getAuthUrl, 
  handleOAuthCallback, 
  checkConnectionStatus, 
  getAllAccounts, 
  switchAccount, 
  removeAccount,
  isOAuthConfigured 
} from "./googleAuth";

// Server-side session store for authenticated users
// Key: session token, Value: { userId, role, name, createdAt }
interface ServerSession {
  userId: string;
  role: string;
  name: string;
  createdAt: number;
}
type PermissionId =
  | "arm_disarm"
  | "flight_control"
  | "mission_planning"
  | "camera_control"
  | "view_telemetry"
  | "view_map"
  | "view_camera"
  | "system_settings"
  | "user_management"
  | "automation_scripts"
  | "run_terminal"
  | "emergency_override"
  | "object_tracking"
  | "broadcast_audio"
  | "manage_geofences"
  | "access_flight_recorder";

const serverRolePermissions: Record<string, PermissionId[]> = {
  admin: [
    "arm_disarm",
    "flight_control",
    "mission_planning",
    "camera_control",
    "view_telemetry",
    "view_map",
    "view_camera",
    "system_settings",
    "user_management",
    "automation_scripts",
    "run_terminal",
    "emergency_override",
    "object_tracking",
    "broadcast_audio",
    "manage_geofences",
    "access_flight_recorder",
  ],
  operator: [
    "arm_disarm",
    "flight_control",
    "mission_planning",
    "camera_control",
    "view_telemetry",
    "view_map",
    "view_camera",
    "system_settings",
    "automation_scripts",
    "run_terminal",
    "object_tracking",
    "broadcast_audio",
    "manage_geofences",
    "access_flight_recorder",
  ],
  viewer: ["view_telemetry", "view_map", "view_camera"],
};

const activeSessions = new Map<string, ServerSession>();
const airspaceCache = new Map<string, { expiresAt: number; payload: any }>();
const staticAirspaceCache = new Map<string, any>();
let serialPassthroughProcess: any = null;
const serialPassthroughState = {
  running: false,
  command: "",
  startedAt: null as string | null,
  message: "Not running",
};
let rtkNtripProcess: any = null;
const rtkNtripState = {
  running: false,
  command: "",
  startedAt: null as string | null,
  host: "",
  port: 0,
  mountpoint: "",
  message: "Not running",
};
let gpsInjectProcess: any = null;
const gpsInjectState = {
  running: false,
  command: "",
  startedAt: null as string | null,
  profileId: "",
  message: "Not running",
};
const firmwareState: {
  busy: boolean;
  progress: number;
  status: "idle" | "running" | "completed" | "failed";
  message: string;
  lastRunAt: string | null;
} = {
  busy: false,
  progress: 0,
  status: "idle",
  message: "No firmware operation yet",
  lastRunAt: null,
};
const calibrationState: Record<string, { status: "idle" | "running" | "completed" | "failed"; lastRunAt: string | null; message?: string; ack?: number | null }> = {
  compass: { status: "idle", lastRunAt: null },
  accel: { status: "idle", lastRunAt: null },
  radio: { status: "idle", lastRunAt: null },
  esc: { status: "idle", lastRunAt: null },
  gyro: { status: "idle", lastRunAt: null },
  baro: { status: "idle", lastRunAt: null },
  level: { status: "idle", lastRunAt: null },
};
const DATA_DIR = path.resolve(process.cwd(), "data");
const CLOUD_RUNTIME_CONFIG_FILE = path.join(DATA_DIR, "cloud_runtime_config.json");
const RTK_PROFILE_FILE = path.join(DATA_DIR, "rtk_profiles.json");
const PLUGINS_DIR = path.resolve(process.cwd(), "plugins");
const PLUGIN_STATE_FILE = path.join(DATA_DIR, "plugin_state.json");
const FIRMWARE_CATALOG_FILE = path.join(DATA_DIR, "firmware_catalog.json");
const MEDIA_STAGING_DIR = path.join(DATA_DIR, "media_staging");
const OPTIONAL_HARDWARE_PROFILES: Record<string, Array<{ name: string; value: number }>> = {
  dronecan_core: [
    { name: "CAN_P1_DRIVER", value: 1 },
    { name: "CAN_D1_PROTOCOL", value: 1 },
  ],
  dronecan_periph_scan: [
    { name: "CAN_P1_DRIVER", value: 1 },
    { name: "CAN_D1_PROTOCOL", value: 1 },
    { name: "CAN_D1_UC_NODE", value: 10 },
  ],
  rangefinder_lidar: [
    { name: "RNGFND1_TYPE", value: 8 },
    { name: "RNGFND1_ORIENT", value: 25 },
    { name: "RNGFND1_MAX_CM", value: 4000 },
  ],
  rangefinder_secondary: [
    { name: "RNGFND2_TYPE", value: 8 },
    { name: "RNGFND2_ORIENT", value: 0 },
    { name: "RNGFND2_MAX_CM", value: 4000 },
  ],
  battery_monitor_dual: [
    { name: "BATT_MONITOR", value: 4 },
    { name: "BATT2_MONITOR", value: 4 },
    { name: "BATT_ARM_VOLT", value: 10.5 },
  ],
  battery_monitor_smart: [
    { name: "BATT_MONITOR", value: 16 },
    { name: "BATT_FS_LOW_ACT", value: 2 },
    { name: "BATT_ARM_MAH", value: 200 },
  ],
  optical_flow: [
    { name: "FLOW_TYPE", value: 5 },
    { name: "FLOW_ORIENT_YAW", value: 0 },
    { name: "EK3_SRC1_VELXY", value: 5 },
  ],
  adsb_core: [
    { name: "ADSB_ENABLE", value: 1 },
    { name: "AVD_ENABLE", value: 1 },
    { name: "AVD_W_DIST_XY", value: 40 },
  ],
  esc_telemetry: [
    { name: "SERVO_BLH_AUTO", value: 1 },
    { name: "SERVO_BLH_MASK", value: 65535 },
    { name: "SERVO_BLH_TRATE", value: 10 },
  ],
};

const SIK_MODEM_PROFILES: Record<string, string[]> = {
  long_range: ["ATS1=57", "ATS2=64", "ATS3=64", "ATS4=25", "ATS5=33", "ATS8=1", "AT&W"],
  low_latency: ["ATS1=57", "ATS2=128", "ATS3=128", "ATS4=25", "ATS5=50", "ATS8=1", "AT&W"],
  robust: ["ATS1=57", "ATS2=32", "ATS3=32", "ATS4=20", "ATS5=20", "ATS8=1", "AT&W"],
};

interface RtkProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  mountpoint: string;
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
}

async function readRtkProfiles(): Promise<RtkProfile[]> {
  try {
    if (!existsSync(RTK_PROFILE_FILE)) return [];
    const raw = await readFile(RTK_PROFILE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRtkProfiles(profiles: RtkProfile[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  await writeFile(RTK_PROFILE_FILE, JSON.stringify(profiles, null, 2), "utf-8");
}

async function readPluginState(): Promise<Record<string, { enabled: boolean }>> {
  try {
    if (!existsSync(PLUGIN_STATE_FILE)) return {};
    const raw = await readFile(PLUGIN_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePluginState(state: Record<string, { enabled: boolean }>) {
  mkdirSync(DATA_DIR, { recursive: true });
  await writeFile(PLUGIN_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function readFirmwareCatalog(): Promise<any[]> {
  try {
    if (!existsSync(FIRMWARE_CATALOG_FILE)) return [];
    const raw = await readFile(FIRMWARE_CATALOG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFirmwareCatalog(entries: any[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  await writeFile(FIRMWARE_CATALOG_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

import { randomBytes } from 'crypto';

// Generate a cryptographically secure random token
function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars, 256 bits of entropy
}

// Validate session token and return session info
function validateSession(token: string | undefined): ServerSession | null {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  // Session expires after 24 hours
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function requestSession(req: any): ServerSession | null {
  const token = req.headers["x-session-token"] as string | undefined;
  return validateSession(token);
}

function hasServerPermission(session: ServerSession | null, permission: PermissionId): boolean {
  if (!session) {
    if (activeSessions.size === 0) return true;
    return false;
  }
  const role = String(session.role || "viewer").toLowerCase();
  if (role === "admin") return true;
  return (serverRolePermissions[role] || []).includes(permission);
}

function requireAuth(req: any, res: any, next: any) {
  const session = requestSession(req);
  if (!session) {
    if (activeSessions.size === 0) {
      req.serverSession = { userId: "preview", role: "admin", name: "Preview User" };
      return next();
    }
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  req.serverSession = session;
  next();
}

function requirePermission(permission: PermissionId) {
  return (req: any, res: any, next: any) => {
    const session = requestSession(req);
    if (!session) {
      if (activeSessions.size === 0) {
        req.serverSession = { userId: "preview", role: "admin", name: "Preview User" };
        return next();
      }
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    if (!hasServerPermission(session, permission)) {
      return res.status(403).json({ success: false, error: "Insufficient permissions" });
    }
    req.serverSession = session;
    next();
  };
}

function requirePermissionForWrites(permission: PermissionId) {
  const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  return (req: any, res: any, next: any) => {
    if (!writeMethods.has(String(req.method || "GET").toUpperCase())) {
      return next();
    }
    return requirePermission(permission)(req, res, next);
  };
}

interface AirspaceZone {
  id: string;
  name: string;
  type: "circle" | "polygon" | "custom";
  enabled?: boolean;
  action?: "rtl" | "land" | "hover" | "warn";
  center?: { lat: number; lng: number };
  radius?: number;
  points?: { lat: number; lng: number }[];
  altMin?: number;
  altMax?: number;
  active?: boolean;
  source?: string;
  description?: string;
  effectiveDate?: string | null;
  expirationDate?: string | null;
}

const RESTRICTED_MATCH = /(restrict|prohibit|danger|tfr|temporary flight restriction|no[-\s]?fly)/i;

function safeNumber(input: unknown): number | null {
  const v = Number(input);
  return Number.isFinite(v) ? v : null;
}

function buildBoundingBoxFromCenter(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;
  return { minLng, minLat, maxLng, maxLat };
}

function parseBboxParam(raw: string | undefined | null) {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { minLng: parts[0], minLat: parts[1], maxLng: parts[2], maxLat: parts[3] };
}

function zoneBbox(points: { lat: number; lng: number }[]) {
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLat = Math.max(maxLat, p.lat);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLng, minLat, maxLng, maxLat };
}

function bboxesOverlap(a: { minLng: number; minLat: number; maxLng: number; maxLat: number }, b: { minLng: number; minLat: number; maxLng: number; maxLat: number }) {
  return !(a.maxLng < b.minLng || a.minLng > b.maxLng || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

function generateCirclePoints(lat: number, lng: number, radiusNm: number): { lat: number; lng: number }[] {
  const radiusDeg = (radiusNm * 1.852) / 111.32;
  const points: { lat: number; lng: number }[] = [];
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    points.push({
      lat: lat + radiusDeg * Math.sin(angle),
      lng: lng + (radiusDeg * Math.cos(angle)) / Math.cos(lat * Math.PI / 180),
    });
  }
  return points;
}

function normalizeStaticGeoJsonToZones(raw: any, labelPrefix: string): AirspaceZone[] {
  const features = Array.isArray(raw?.features) ? raw.features : [];
  const zones: AirspaceZone[] = [];

  const addPolygon = (id: string, name: string, coords: any[]) => {
    const points = coords
      .map((coord: any) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lng = safeNumber(coord[0]);
        const lat = safeNumber(coord[1]);
        if (lat == null || lng == null) return null;
        return { lat, lng };
      })
      .filter((p): p is { lat: number; lng: number } => Boolean(p));
    if (points.length < 3) return;
    zones.push({
      id,
      name,
      type: "polygon",
      enabled: true,
      action: "warn",
      points,
    });
  };

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const props = feature?.properties || {};
    const id = String(props.FAA_ID || props.OBJECTID || `${labelPrefix}-${i + 1}`);
    const name = `${labelPrefix}: ${String(props.Facility || props.Base || "Restricted Area")}`;
    const geom = feature?.geometry;
    if (!geom) continue;

    if (geom.type === "Polygon" && Array.isArray(geom.coordinates?.[0])) {
      addPolygon(id, name, geom.coordinates[0]);
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      const firstPoly = geom.coordinates[0];
      if (Array.isArray(firstPoly?.[0])) {
        addPolygon(id, name, firstPoly[0]);
      }
    }
  }

  return zones;
}

function normalizeRestrictedZonesFromProvider(raw: any): AirspaceZone[] {
  const container = raw?.items || raw?.results || raw?.features || raw?.data || [];
  const source = Array.isArray(container) ? container : [];
  const zones: AirspaceZone[] = [];

  const pushPolygon = (id: string, name: string, coords: any) => {
    if (!Array.isArray(coords) || coords.length < 3) return;
    const points = coords
      .map((c: any) => {
        if (!Array.isArray(c) || c.length < 2) return null;
        const lng = safeNumber(c[0]);
        const lat = safeNumber(c[1]);
        if (lat == null || lng == null) return null;
        return { lat, lng };
      })
      .filter(Boolean) as { lat: number; lng: number }[];
    if (points.length < 3) return;
    zones.push({
      id,
      name,
      type: "polygon",
      enabled: true,
      action: "warn",
      points,
    });
  };

  for (const entry of source) {
    const base = entry?.properties ? { ...entry, ...entry.properties } : entry || {};
    const id = String(base.id || base._id || base.uuid || `airspace-${zones.length + 1}`);
    const name = String(base.name || base.title || base.designator || "Restricted Airspace");
    const typeString = String(
      base.type ||
        base.airspaceType ||
        base.category ||
        base.class ||
        base.classification ||
        "",
    );
    const sourceText = `${name} ${typeString}`;
    if (!RESTRICTED_MATCH.test(sourceText)) {
      continue;
    }

    const geometry = entry?.geometry || base?.geometry || null;
    const geoType = geometry?.type;
    const coordinates = geometry?.coordinates;

    if (geoType === "Polygon" && Array.isArray(coordinates) && coordinates[0]) {
      pushPolygon(id, name, coordinates[0]);
      continue;
    }

    if (geoType === "MultiPolygon" && Array.isArray(coordinates) && coordinates[0]?.[0]) {
      pushPolygon(id, name, coordinates[0][0]);
      continue;
    }

    const centerLat = safeNumber(base.lat ?? base.latitude ?? base.center?.lat ?? base.center?.latitude);
    const centerLng = safeNumber(base.lng ?? base.lon ?? base.longitude ?? base.center?.lng ?? base.center?.longitude);
    const radius = safeNumber(base.radius ?? base.radiusMeters ?? base.dist ?? base.distance);

    if (centerLat != null && centerLng != null && radius != null && radius > 0) {
      zones.push({
        id,
        name,
        type: "circle",
        enabled: true,
        action: "warn",
        center: { lat: centerLat, lng: centerLng },
        radius,
      });
    }
  }

  return zones;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // WebSocket server for real-time telemetry streaming
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Track clients with their user IDs for DM privacy
  interface ClientInfo {
    ws: WebSocket;
    userId: string | null;
  }
  const clients = new Map<WebSocket, ClientInfo>();

  type DebugEventLevel = "info" | "warn" | "error" | "success";
  interface DebugEvent {
    id: string;
    timestamp: string;
    level: DebugEventLevel;
    source: string;
    message: string;
    details?: any;
  }
  const debugEvents: DebugEvent[] = [];
  const DEBUG_EVENT_LIMIT = 800;
  let lastCloudHealthProbe: any = null;
  let lastCloudHealthProbeAt: string | null = null;
  let lastApiError: { at: string; method: string; path: string; status: number } | null = null;
  let lastSlowApi: { at: string; method: string; path: string; durationMs: number } | null = null;

  const pushDebugEvent = (
    level: DebugEventLevel,
    source: string,
    message: string,
    details?: any,
  ) => {
    const event: DebugEvent = {
      id: randomBytes(8).toString("hex"),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details: details ?? null,
    };
    debugEvents.push(event);
    if (debugEvents.length > DEBUG_EVENT_LIMIT) {
      debugEvents.splice(0, debugEvents.length - DEBUG_EVENT_LIMIT);
    }

    const payload = JSON.stringify({ type: "debug_event", data: event });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.send(payload);
      }
    });
  };

  const runCloudHealthProbe = async () => {
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    const configured = Boolean(cloudSyncEnabled() && getFirebaseAdminDb());
    const result = {
      checkedAt,
      configured,
      success: false,
      degraded: false,
      totalLatencyMs: 0,
      firestore: { ok: false, latencyMs: null as number | null, error: null as string | null },
      realtimeDatabase: { ok: false, latencyMs: null as number | null, error: null as string | null },
      storage: { ok: false, latencyMs: null as number | null, error: null as string | null },
      error: null as string | null,
    };

    if (!configured) {
      result.error = "Firebase is not configured. Set FIREBASE_PROJECT_ID and service account credentials.";
      result.totalLatencyMs = Date.now() - startedAt;
      return result;
    }

    const rtdb = getFirebaseAdminRtdb();
    const storageAdmin = getFirebaseAdminStorage();
    if (!rtdb) {
      result.realtimeDatabase.error = "Realtime Database not configured";
    }
    if (!storageAdmin) {
      result.storage.error = "Cloud Storage not configured";
    }

    const probeId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    try {
      const t0 = Date.now();
      await syncCloudDocument("_debug_health", "latest", { probeId, checkedAt, source: "debug/system" });
      result.firestore.ok = true;
      result.firestore.latencyMs = Date.now() - t0;
    } catch (error: any) {
      result.firestore.error = error?.message || String(error);
    }

    if (rtdb) {
      try {
        const t0 = Date.now();
        await rtdb.ref("_debug/health/last").set({ probeId, checkedAt, source: "debug/system" });
        result.realtimeDatabase.ok = true;
        result.realtimeDatabase.latencyMs = Date.now() - t0;
      } catch (error: any) {
        result.realtimeDatabase.error = error?.message || String(error);
      }
    }

    if (storageAdmin) {
      try {
        const t0 = Date.now();
        const uploaded = await uploadCloudStorageObject(
          "_debug/health-probe.txt",
          Buffer.from(`probe=${probeId};checkedAt=${checkedAt}`),
          "text/plain",
        );
        if (uploaded.ok) {
          result.storage.ok = true;
          result.storage.latencyMs = Date.now() - t0;
        } else {
          result.storage.error = uploaded.error || "Cloud Storage upload failed";
        }
      } catch (error: any) {
        result.storage.error = error?.message || String(error);
      }
    }

    result.success = result.firestore.ok && result.realtimeDatabase.ok && result.storage.ok;
    result.degraded = !result.success && (result.firestore.ok || result.realtimeDatabase.ok || result.storage.ok);
    result.totalLatencyMs = Date.now() - startedAt;
    if (!result.success && !result.error) {
      result.error = "One or more cloud services failed health checks";
    }
    return result;
  };

  const readCloudRuntimeConfig = async (): Promise<Record<string, any>> => {
    try {
      if (!existsSync(CLOUD_RUNTIME_CONFIG_FILE)) return {};
      const raw = await readFile(CLOUD_RUNTIME_CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const sanitizeCloudConfig = (cfg: Record<string, any>) => ({
    projectId: String(cfg.projectId || "").trim() || null,
    databaseURL: String(cfg.databaseURL || "").trim() || null,
    storageBucket: String(cfg.storageBucket || "").trim() || null,
    serviceAccountPath: String(cfg.serviceAccountPath || "").trim() || null,
    serviceAccountJson: String(cfg.serviceAccountJson || "").trim() || null,
    serviceAccountBase64: String(cfg.serviceAccountBase64 || "").trim() || null,
  });

  const getEffectiveCloudConfig = async () => {
    const runtime = sanitizeCloudConfig(await readCloudRuntimeConfig());
    const hardcoded = {
      projectId: HARDCODED_FIREBASE_PROJECT.projectId || null,
      databaseURL: HARDCODED_FIREBASE_PROJECT.databaseURL || null,
      storageBucket: HARDCODED_FIREBASE_PROJECT.storageBucket || null,
      serviceAccountPath: HARDCODED_FIREBASE_PROJECT.serviceAccountPath || null,
      serviceAccountJson: null,
      serviceAccountBase64: null,
    };
    const env = {
      projectId: process.env.FIREBASE_PROJECT_ID || null,
      databaseURL: process.env.FIREBASE_DATABASE_URL || null,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || null,
      serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || null,
      serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null,
      serviceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || null,
    };
    return {
      projectId: env.projectId || runtime.projectId || hardcoded.projectId,
      databaseURL: env.databaseURL || runtime.databaseURL || hardcoded.databaseURL,
      storageBucket: env.storageBucket || runtime.storageBucket || hardcoded.storageBucket,
      serviceAccountPath: env.serviceAccountPath || runtime.serviceAccountPath || hardcoded.serviceAccountPath,
      serviceAccountJson: env.serviceAccountJson || runtime.serviceAccountJson || hardcoded.serviceAccountJson,
      serviceAccountBase64: env.serviceAccountBase64 || runtime.serviceAccountBase64 || hardcoded.serviceAccountBase64,
      source: {
        projectId: env.projectId ? "env" : runtime.projectId ? "runtime" : hardcoded.projectId ? "hardcoded" : "unset",
        databaseURL: env.databaseURL ? "env" : runtime.databaseURL ? "runtime" : hardcoded.databaseURL ? "hardcoded" : "unset",
        storageBucket: env.storageBucket ? "env" : runtime.storageBucket ? "runtime" : hardcoded.storageBucket ? "hardcoded" : "unset",
        serviceAccount: env.serviceAccountJson || env.serviceAccountBase64 || env.serviceAccountPath
          ? "env"
          : runtime.serviceAccountJson || runtime.serviceAccountBase64 || runtime.serviceAccountPath
            ? "runtime"
            : hardcoded.serviceAccountPath
              ? "hardcoded"
              : "unset",
      },
    };
  };

  const saveCloudRuntimeConfig = async (cfg: Record<string, any>) => {
    mkdirSync(DATA_DIR, { recursive: true });
    await writeFile(CLOUD_RUNTIME_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  };
  
  wss.on("connection", (ws) => {
    // Initially, user is not authenticated
    const clientInfo: ClientInfo = { ws, userId: null };
    clients.set(ws, clientInfo);
    console.log("WebSocket client connected");
    
    // Handle incoming messages to register user ID
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.sessionToken) {
          // Validate token against server session store
          const session = validateSession(msg.sessionToken);
          if (session) {
            clientInfo.userId = session.userId;
            console.log(`WebSocket client authenticated as user: ${session.userId} (${session.name})`);
          } else {
            console.log("WebSocket auth failed: invalid or expired session token");
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    ws.on("close", () => {
      clients.delete(ws);
      console.log("WebSocket client disconnected");
    });
  });
  
  // Broadcast function for real-time data (non-DM messages)
  const broadcast = (type: string, data: any) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.send(message);
      }
    });
    void publishCloudRealtime(type, data).catch(() => {});
  };

  // Send to specific users only (for DMs)
  const sendToUsers = (type: string, data: any, userIds: string[]) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN && 
          clientInfo.userId && 
          userIds.includes(clientInfo.userId)) {
        clientInfo.ws.send(message);
      }
    });
  };

  // Smart broadcast - handles DMs privately, broadcasts public messages
  const smartBroadcast = (type: string, data: any) => {
    // Check if this is a DM (has recipientId)
    if (data.recipientId) {
      // Only send to sender and recipient
      const targetUsers = [data.senderId, data.recipientId].filter(Boolean);
      sendToUsers(type, data, targetUsers);
    } else {
      // Public message - broadcast to all
      broadcast(type, data);
    }
  };

  const storeMediaLocally = async (fileName: string, bytes: Buffer) => {
    mkdirSync(MEDIA_STAGING_DIR, { recursive: true });
    const safeName = `${Date.now()}-${fileName.replace(/[^\w.\-]+/g, "_")}`;
    const localPath = path.join(MEDIA_STAGING_DIR, safeName);
    await writeFile(localPath, bytes);
    return localPath;
  };

  const ingestMediaToCloudOrBacklog = async (opts: {
    fileName: string;
    mimeType: string;
    bytes: Buffer;
    sessionId?: string | null;
    droneId?: string | null;
    session: ServerSession | null;
    createAsset?: boolean;
  }) => {
    const { fileName, mimeType, bytes, sessionId, droneId, session, createAsset = true } = opts;
    const objectPath = `media/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, "_")}`;
    const uploaded = await uploadCloudStorageObject(objectPath, bytes, mimeType);
    const capturedAt = new Date().toISOString();

    if (uploaded.ok) {
      if (!createAsset) {
        return { uploaded: true, pending: false, cloudPath: uploaded.gsUri || uploaded.objectPath };
      }
      const asset = await storage.createMediaAsset({
        droneId: droneId || null,
        sessionId: sessionId || null,
        type: mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "photo" : "binary",
        filename: fileName,
        storagePath: uploaded.gsUri || uploaded.objectPath,
        driveFileId: null,
        driveLink: uploaded.gsUri || null,
        mimeType,
        fileSize: bytes.byteLength,
        duration: null,
        latitude: null,
        longitude: null,
        altitude: null,
        heading: null,
        cameraMode: null,
        zoomLevel: null,
        syncStatus: "synced",
        syncError: null,
        capturedAt,
      });
      void syncCloudDocument("media_assets", asset.id, asset, { session }).catch(() => {});
      return { uploaded: true, pending: false, asset, cloudPath: uploaded.gsUri || uploaded.objectPath };
    }

    const localFilePath = await storeMediaLocally(fileName, bytes);
    if (!createAsset) {
      return { uploaded: false, pending: true, localFilePath, error: uploaded.error || "Cloud unavailable" };
    }
    const asset = await storage.createMediaAsset({
      droneId: droneId || null,
      sessionId: sessionId || null,
      type: mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "photo" : "binary",
      filename: fileName,
      storagePath: localFilePath,
      driveFileId: null,
      driveLink: null,
      mimeType,
      fileSize: bytes.byteLength,
      duration: null,
      latitude: null,
      longitude: null,
      altitude: null,
      heading: null,
      cameraMode: null,
      zoomLevel: null,
      syncStatus: "pending",
      syncError: uploaded.error || "Cloud unavailable",
      capturedAt,
    });

    await storage.createBacklogItem({
      droneId: droneId || null,
      dataType: "media",
      data: {
        mediaAssetId: asset.id,
        fileName,
        mimeType,
      },
      priority: 2,
      localFilePath,
      fileChecksum: null,
      syncStatus: "pending",
      syncAttempts: 0,
      lastSyncAttempt: null,
      syncError: uploaded.error || "Cloud unavailable",
      recordedAt: capturedAt,
    });
    void syncCloudDocument("media_assets", asset.id, asset, { session }).catch(() => {});
    return { uploaded: false, pending: true, asset, localFilePath };
  };

  const syncPendingMediaBacklog = async (session: ServerSession | null = null) => {
    const pending = await storage.getPendingBacklog();
    const mediaItems = pending.filter((item) => item.dataType === "media" && item.localFilePath);
    const results: Array<{ id: string; synced: boolean; error?: string }> = [];
    for (const item of mediaItems) {
      try {
        const meta = item.data || {};
        const localFilePath = String(item.localFilePath || "");
        if (!existsSync(localFilePath)) {
          await storage.updateBacklogItem(item.id, { syncStatus: "failed", syncError: "Local file missing" });
          results.push({ id: item.id, synced: false, error: "Local file missing" });
          continue;
        }
        const bytes = await readFile(localFilePath);
        const fileName = String(meta.fileName || path.basename(localFilePath));
        const mimeType = String(meta.mimeType || "application/octet-stream");
        const objectPath = `media/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, "_")}`;
        const uploaded = await uploadCloudStorageObject(objectPath, bytes, mimeType);
        if (!uploaded.ok) {
          await storage.updateBacklogItem(item.id, {
            syncStatus: "pending",
            syncAttempts: (item.syncAttempts || 0) + 1,
            syncError: uploaded.error || "Cloud unavailable",
          });
          results.push({ id: item.id, synced: false, error: uploaded.error || "Cloud unavailable" });
          continue;
        }

        const mediaAssetId = String(meta.mediaAssetId || "");
        if (mediaAssetId) {
          const updated = await storage.updateMediaAsset(mediaAssetId, {
            storagePath: uploaded.gsUri || uploaded.objectPath,
            driveLink: uploaded.gsUri || null,
            syncStatus: "synced",
            syncError: null,
          });
          if (updated) {
            void syncCloudDocument("media_assets", updated.id, updated, { session }).catch(() => {});
          }
        }
        await storage.markBacklogSynced(item.id);
        results.push({ id: item.id, synced: true });
      } catch (error: any) {
        await storage.updateBacklogItem(item.id, {
          syncStatus: "pending",
          syncAttempts: (item.syncAttempts || 0) + 1,
          syncError: error?.message || String(error),
        });
        results.push({ id: item.id, synced: false, error: error?.message || String(error) });
      }
    }
    return results;
  };

  // Background retry for cloud media sync when connectivity returns.
  setInterval(() => {
    void syncPendingMediaBacklog(null).catch(() => {});
  }, 60_000);

  const runMavlinkParamBridge = async (args: string[]) => {
    return await new Promise<any>((resolve) => {
      const py = spawn(PYTHON_EXEC, [path.join(SCRIPTS_DIR, "mavlink_params.py"), ...args]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          resolve({ ok: Boolean(parsed?.success), data: parsed, error: parsed?.error || err || null });
        } catch {
          resolve({ ok: false, data: null, error: err || "Invalid bridge response" });
        }
      });
    });
  };

  const runMavlinkVehicleControl = async (args: string[]) => {
    return await new Promise<any>((resolve) => {
      const py = spawn(PYTHON_EXEC, [path.join(SCRIPTS_DIR, "mavlink_vehicle_control.py"), ...args]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          resolve({ ok: Boolean(parsed?.success), data: parsed, error: parsed?.error || err || null });
        } catch {
          resolve({ ok: false, data: null, error: err || "Invalid bridge response" });
        }
      });
    });
  };

  const execCommand = async (
    command: string,
    args: string[],
  ): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> => {
    return await new Promise((resolve) => {
      const proc = spawn(command, args);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", () => {
        resolve({ ok: false, stdout, stderr, code: null });
      });

      proc.on("close", (code: number) => {
        resolve({ ok: code === 0, stdout, stderr, code });
      });
    });
  };

  interface AudioSystemState {
    deviceType: "gpio" | "usb" | "buzzer";
    deviceId: string;
    volume: number;
    live: { active: boolean; source: string; startedAt: string | null };
    droneMic: { enabled: boolean; listening: boolean; volume: number; updatedAt: string | null };
    lastTtsAt: string | null;
    lastBuzzerTone: string | null;
  }

  interface Mapping3DState {
    active: boolean;
    framesCaptured: number;
    coveragePercent: number;
    confidence: number;
    trackX: number;
    trackY: number;
    distanceEstimate: number;
    coverageBins: Set<string>;
    trajectory: Array<{ x: number; y: number; t: number; conf: number }>;
    lastFrameAt: string | null;
    lastModelPath: string | null;
    lastModelGeneratedAt: string | null;
  }

  type AudioSessionMode = "listen" | "talk" | "duplex";
  interface AudioBridgeSession {
    sessionId: string;
    userId: string;
    userRole: string;
    userName: string;
    droneId: string;
    mode: AudioSessionMode;
    connectedAt: string;
    updatedAt: string;
    active: boolean;
  }

  const audioState: AudioSystemState = {
    deviceType: "gpio",
    deviceId: "gpio-default",
    volume: 80,
    live: { active: false, source: "operator-mic", startedAt: null },
    droneMic: { enabled: false, listening: false, volume: 70, updatedAt: null },
    lastTtsAt: null,
    lastBuzzerTone: null,
  };

  const mappingState: Mapping3DState = {
    active: true,
    framesCaptured: 0,
    coveragePercent: 0,
    confidence: 0,
    trackX: 0,
    trackY: 0,
    distanceEstimate: 0,
    coverageBins: new Set<string>(),
    trajectory: [],
    lastFrameAt: null,
    lastModelPath: null,
    lastModelGeneratedAt: null,
  };
  const audioBridgeSessions = new Map<string, AudioBridgeSession>();

  const resolveAudioDevices = async (): Promise<string[]> => {
    const platform = os.platform();

    if (platform === "linux") {
      const result = await execCommand("aplay", ["-l"]);
      if (result.ok) {
        const parsed = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("card "))
          .map((line) => line.replace(/,\s*device\s*/i, " / device "));
        if (parsed.length > 0) return parsed;
      }
    }

    if (platform === "darwin") {
      const result = await execCommand("system_profiler", ["SPAudioDataType"]);
      if (result.ok) {
        const parsed = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.endsWith(":") && !line.startsWith("Audio:"))
          .map((line) => line.replace(/:$/, ""))
          .filter((line) => line.length > 0 && !line.startsWith("Devices"));
        if (parsed.length > 0) return Array.from(new Set(parsed));
      }
    }

    if (platform === "win32") {
      const result = await execCommand("powershell", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_SoundDevice | Select-Object -ExpandProperty Name)",
      ]);
      if (result.ok) {
        const parsed = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (parsed.length > 0) return parsed;
      }
    }

    return ["System Default Audio", "USB Audio (fallback)"];
  };

  const runLocalTts = async (
    text: string,
    rate: number,
    voiceType: string,
  ): Promise<{ played: boolean; engine: string }> => {
    const normalizedRate = Math.max(0.5, Math.min(2, rate || 1));
    const platform = os.platform();

    if (platform === "darwin") {
      const speechRate = String(Math.round(normalizedRate * 200));
      const voice = voiceType === "female" ? "Samantha" : voiceType === "male" ? "Daniel" : "Alex";
      const res = await execCommand("say", ["-v", voice, "-r", speechRate, text]);
      if (res.ok) return { played: true, engine: "say" };
    } else if (platform === "linux") {
      const wpm = String(Math.round(normalizedRate * 175));
      const res = await execCommand("espeak", ["-s", wpm, text]);
      if (res.ok) return { played: true, engine: "espeak" };
      const fallback = await execCommand("spd-say", [text]);
      if (fallback.ok) return { played: true, engine: "spd-say" };
    } else if (platform === "win32") {
      const escaped = text.replace(/'/g, "''");
      const script = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        "$s.Rate = 0",
        `$s.Speak('${escaped}')`,
      ].join("; ");
      const res = await execCommand("powershell", ["-NoProfile", "-Command", script]);
      if (res.ok) return { played: true, engine: "powershell-sapi" };
    }

    return { played: false, engine: "simulated" };
  };

  // Health check endpoint for Electron app startup detection
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });

  app.use("/api", (req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - started;
      const method = String(req.method || "GET").toUpperCase();
      const routePath = String(req.path || "");
      if (routePath.startsWith("/debug")) return;

      if (res.statusCode >= 500) {
        lastApiError = { at: new Date().toISOString(), method, path: routePath, status: res.statusCode };
        pushDebugEvent("error", "api.runtime", "API request failed", {
          method,
          path: routePath,
          status: res.statusCode,
          durationMs,
        });
        return;
      }
      if (res.statusCode >= 400) {
        pushDebugEvent("warn", "api.runtime", "API request returned client error", {
          method,
          path: routePath,
          status: res.statusCode,
          durationMs,
        });
        return;
      }
      if (durationMs >= 1500) {
        lastSlowApi = { at: new Date().toISOString(), method, path: routePath, durationMs };
        pushDebugEvent("warn", "api.runtime", "API request was slow", {
          method,
          path: routePath,
          status: res.statusCode,
          durationMs,
        });
      }
    });
    next();
  });

  // Server-side access control: protect control/data endpoints from anonymous calls.
  app.use("/api/audio", requireAuth, requirePermissionForWrites("broadcast_audio"));
  app.use("/api/mavlink", requirePermission("flight_control"));
  app.use("/api/debug", requirePermission("system_settings"));
  app.use("/api/messages", requireAuth);
  app.use("/api/settings", requirePermissionForWrites("system_settings"));
  app.use("/api/missions", requirePermissionForWrites("mission_planning"));
  app.use("/api/waypoints", requirePermissionForWrites("mission_planning"));
  app.use("/api/drones", requirePermissionForWrites("system_settings"));
  app.use("/api/media", requirePermissionForWrites("camera_control"));
  app.use("/api/flight-logs", requirePermissionForWrites("access_flight_recorder"));
  app.use("/api/motor-telemetry", requirePermissionForWrites("view_telemetry"));
  app.use("/api/sensor-data", requirePermissionForWrites("view_telemetry"));

  // Audio control API (cross-platform with local fallbacks)
  app.get("/api/audio/status", async (_req, res) => {
    res.json({
      success: true,
      platform: os.platform(),
      state: audioState,
      bridgeSessions: Array.from(audioBridgeSessions.values()),
    });
  });

  app.get("/api/audio/session", async (req, res) => {
    const session = requestSession(req);
    if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
    const items = Array.from(audioBridgeSessions.values()).filter((s) =>
      session.role === "admin" ? true : s.userId === session.userId,
    );
    res.json({ success: true, sessions: items });
  });

  app.post("/api/audio/session/join", async (req, res) => {
    const session = requestSession(req);
    if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
    const droneId = String(req.body?.droneId || "").trim();
    const mode = String(req.body?.mode || "duplex").trim() as AudioSessionMode;
    if (!droneId) return res.status(400).json({ success: false, error: "droneId is required" });
    if (!["listen", "talk", "duplex"].includes(mode)) {
      return res.status(400).json({ success: false, error: "Invalid mode" });
    }

    const id = `${session.userId}:${droneId}`;
    const now = new Date().toISOString();
    const updated: AudioBridgeSession = {
      sessionId: id,
      userId: session.userId,
      userRole: session.role || "viewer",
      userName: session.name || session.userId,
      droneId,
      mode,
      connectedAt: audioBridgeSessions.get(id)?.connectedAt || now,
      updatedAt: now,
      active: true,
    };
    audioBridgeSessions.set(id, updated);
    broadcast("audio_bridge_session", { action: "join", session: updated });
    void syncCloudDocument("audio_bridge_sessions", updated.sessionId, updated, { session }).catch(() => {});
    void appendCloudDocument("operator_actions", {
      action: "audio_session_join",
      mode,
      droneId,
      at: now,
    }, { session, visibility: "admin" }).catch(() => {});

    res.json({ success: true, session: updated });
  });

  app.post("/api/audio/session/leave", async (req, res) => {
    const session = requestSession(req);
    if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
    const droneId = String(req.body?.droneId || "").trim();
    if (!droneId) return res.status(400).json({ success: false, error: "droneId is required" });
    const id = `${session.userId}:${droneId}`;
    const existing = audioBridgeSessions.get(id);
    if (existing) {
      audioBridgeSessions.delete(id);
      broadcast("audio_bridge_session", { action: "leave", session: existing });
      void deleteCloudDocument("audio_bridge_sessions", id).catch(() => {});
      void appendCloudDocument("operator_actions", {
        action: "audio_session_leave",
        droneId,
        at: new Date().toISOString(),
      }, { session, visibility: "admin" }).catch(() => {});
    }
    res.json({ success: true });
  });

  app.get("/api/audio/output/devices", async (_req, res) => {
    const devices = await resolveAudioDevices();
    res.json({
      success: true,
      platform: os.platform(),
      devices,
      selectedDevice: audioState.deviceId,
    });
  });

  app.post("/api/audio/output/select", async (req, res) => {
    const { deviceType, deviceId, volume } = req.body ?? {};
    if (!deviceType || !["gpio", "usb", "buzzer"].includes(deviceType)) {
      return res.status(400).json({ success: false, error: "Invalid deviceType" });
    }

    audioState.deviceType = deviceType;
    if (typeof deviceId === "string" && deviceId.trim()) {
      audioState.deviceId = deviceId.trim();
    }
    if (typeof volume === "number" && Number.isFinite(volume)) {
      audioState.volume = Math.max(0, Math.min(100, Math.round(volume)));
    }

    broadcast("audio_output_selected", { ...audioState });
    res.json({ success: true, state: audioState });
  });

  app.post("/api/audio/buzzer", async (req, res) => {
    const tone = String(req.body?.tone || "alert");
    audioState.lastBuzzerTone = tone;
    broadcast("audio_buzzer", { tone, at: new Date().toISOString() });
    res.json({ success: true, tone, state: audioState });
  });

  app.post("/api/audio/tts", async (req, res) => {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ success: false, error: "Text is required" });
    }
    if (text.length > 500) {
      return res.status(400).json({ success: false, error: "Text too long (max 500 chars)" });
    }

    const rate = Number(req.body?.rate ?? 1);
    const voiceType = String(req.body?.voiceType || "default");
    const preview = Boolean(req.body?.preview);
    const engineResult = await runLocalTts(text, rate, voiceType);
    audioState.lastTtsAt = new Date().toISOString();

    if (!preview) {
      broadcast("audio_tts", {
        text,
        voiceType,
        rate,
        deviceType: audioState.deviceType,
        at: audioState.lastTtsAt,
      });
    }

    res.json({
      success: true,
      preview,
      playedLocally: engineResult.played,
      engine: engineResult.engine,
      state: audioState,
    });
  });

  app.get("/api/audio/live/status", async (_req, res) => {
    res.json({ success: true, live: audioState.live });
  });

  app.post("/api/audio/live/start", async (req, res) => {
    const source = String(req.body?.source || "operator-mic");
    const requestedDeviceType = String(req.body?.deviceType || "").trim();
    if (["gpio", "usb", "buzzer"].includes(requestedDeviceType)) {
      audioState.deviceType = requestedDeviceType as "gpio" | "usb" | "buzzer";
    }
    audioState.live = {
      active: true,
      source,
      startedAt: new Date().toISOString(),
    };
    broadcast("audio_live", { ...audioState.live });
    void syncCloudDocument("audio_state", "live", audioState.live, { session: requestSession(req), visibility: "admin" }).catch(() => {});
    res.json({ success: true, live: audioState.live });
  });

  app.post("/api/audio/live/stop", async (_req, res) => {
    audioState.live = {
      active: false,
      source: audioState.live.source,
      startedAt: null,
    };
    broadcast("audio_live", { ...audioState.live });
    void syncCloudDocument("audio_state", "live", audioState.live, { session: null, visibility: "admin" }).catch(() => {});
    res.json({ success: true, live: audioState.live });
  });

  app.get("/api/audio/drone-mic", async (_req, res) => {
    res.json({ success: true, droneMic: audioState.droneMic });
  });

  app.post("/api/audio/drone-mic", async (req, res) => {
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : audioState.droneMic.enabled;
    const listening = typeof req.body?.listening === "boolean" ? req.body.listening : audioState.droneMic.listening;
    const volume = typeof req.body?.volume === "number"
      ? Math.max(0, Math.min(100, Math.round(req.body.volume)))
      : audioState.droneMic.volume;

    audioState.droneMic = {
      enabled,
      listening: enabled ? listening : false,
      volume,
      updatedAt: new Date().toISOString(),
    };

    broadcast("audio_drone_mic", { ...audioState.droneMic });
    void syncCloudDocument("audio_state", "drone_mic", audioState.droneMic, { session: requestSession(req), visibility: "admin" }).catch(() => {});
    res.json({ success: true, droneMic: audioState.droneMic });
  });

  // Local 3D mapping API (GPS-denied visual odometry ingestion + reconstruction artifact generation)
  app.get("/api/mapping/3d/status", async (_req, res) => {
    const trajectoryPreview = mappingState.trajectory.slice(-20);
    res.json({
      success: true,
      status: {
        active: mappingState.active,
        framesCaptured: mappingState.framesCaptured,
        coveragePercent: mappingState.coveragePercent,
        confidence: mappingState.confidence,
        distanceEstimate: Math.round(mappingState.distanceEstimate * 10) / 10,
        lastFrameAt: mappingState.lastFrameAt,
        lastModelPath: mappingState.lastModelPath,
        lastModelGeneratedAt: mappingState.lastModelGeneratedAt,
        trajectoryPreview,
      },
    });
  });

  app.post("/api/mapping/3d/frame", async (req, res) => {
    if (!mappingState.active) {
      return res.status(409).json({ success: false, error: "3D mapping is not active" });
    }

    const now = Date.now();
    const frameWidth = Number(req.body?.frameWidth || 0);
    const frameHeight = Number(req.body?.frameHeight || 0);
    const odometryDx = Number(req.body?.odometry?.dx || 0);
    const odometryDy = Number(req.body?.odometry?.dy || 0);
    const odometryConfidence = Math.max(0, Math.min(1, Number(req.body?.odometry?.confidence || 0)));
    const detections = Array.isArray(req.body?.detections) ? req.body.detections : [];

    mappingState.framesCaptured += 1;
    mappingState.trackX += odometryDx;
    mappingState.trackY += odometryDy;
    mappingState.distanceEstimate += Math.sqrt(odometryDx ** 2 + odometryDy ** 2);
    mappingState.trajectory.push({
      x: Math.round(mappingState.trackX * 100) / 100,
      y: Math.round(mappingState.trackY * 100) / 100,
      t: now,
      conf: odometryConfidence,
    });
    if (mappingState.trajectory.length > 5000) {
      mappingState.trajectory = mappingState.trajectory.slice(-5000);
    }
    mappingState.lastFrameAt = new Date(now).toISOString();

    // Build a coarse coverage map based on detected object centroids.
    const cols = 20;
    const rows = 20;
    const width = Math.max(frameWidth, 1);
    const height = Math.max(frameHeight, 1);
    for (const detection of detections) {
      const cx = Number(detection?.x || 0) + Number(detection?.width || 0) / 2;
      const cy = Number(detection?.y || 0) + Number(detection?.height || 0) / 2;
      const bx = Math.max(0, Math.min(cols - 1, Math.floor((cx / width) * cols)));
      const by = Math.max(0, Math.min(rows - 1, Math.floor((cy / height) * rows)));
      mappingState.coverageBins.add(`${bx}:${by}`);
    }

    const coverageFromBins = (mappingState.coverageBins.size / (cols * rows)) * 100;
    const coverageFromFrames = Math.min(100, mappingState.framesCaptured / 2);
    mappingState.coveragePercent = Math.round(Math.min(100, Math.max(coverageFromBins, coverageFromFrames)));
    mappingState.confidence = Math.round(
      Math.min(
        100,
        Math.max(
          5,
          (mappingState.coveragePercent * 0.45) +
            (Math.min(mappingState.framesCaptured, 300) / 3) * 0.35 +
            (odometryConfidence * 100) * 0.2,
        ),
      ),
    );

    res.json({
      success: true,
      framesCaptured: mappingState.framesCaptured,
      coveragePercent: mappingState.coveragePercent,
      confidence: mappingState.confidence,
    });
  });

  app.post("/api/mapping/3d/reset", async (_req, res) => {
    mappingState.framesCaptured = 0;
    mappingState.coveragePercent = 0;
    mappingState.confidence = 0;
    mappingState.trackX = 0;
    mappingState.trackY = 0;
    mappingState.distanceEstimate = 0;
    mappingState.coverageBins.clear();
    mappingState.trajectory = [];
    mappingState.lastFrameAt = null;
    mappingState.lastModelPath = null;
    mappingState.lastModelGeneratedAt = null;
    mappingState.active = true;
    broadcast("mapping_3d_reset", { at: new Date().toISOString() });
    res.json({ success: true });
  });

  app.post("/api/mapping/3d/reconstruct", async (_req, res) => {
    if (mappingState.framesCaptured < 10) {
      return res.status(400).json({
        success: false,
        error: "Insufficient data for reconstruction (need at least 10 frames)",
      });
    }

    const mapDir = path.resolve(process.cwd(), "data", "3d-maps");
    mkdirSync(mapDir, { recursive: true });
    const ts = new Date();
    const stamp = ts.toISOString().replace(/[:.]/g, "-");
    const modelPath = path.join(mapDir, `map3d-${stamp}.json`);

    const pointCloud = mappingState.trajectory.map((point, index) => ({
      id: index + 1,
      x: point.x,
      y: point.y,
      z: Math.round(Math.sin(index / 14) * 5 * 100) / 100,
      confidence: Math.round(point.conf * 100),
    }));

    const model = {
      type: "local-photogrammetry-map",
      generatedAt: ts.toISOString(),
      frameCount: mappingState.framesCaptured,
      coveragePercent: mappingState.coveragePercent,
      confidence: mappingState.confidence,
      estimatedDistance: Math.round(mappingState.distanceEstimate * 100) / 100,
      trajectory: mappingState.trajectory,
      pointCloud,
      metadata: {
        standalone: true,
        externalServices: false,
        generator: "M.O.U.S.E. onboard local mapper",
      },
    };

    await writeFile(modelPath, JSON.stringify(model, null, 2), "utf-8");
    mappingState.lastModelPath = modelPath;
    mappingState.lastModelGeneratedAt = ts.toISOString();
    broadcast("mapping_3d_reconstructed", {
      modelPath,
      generatedAt: mappingState.lastModelGeneratedAt,
      frameCount: mappingState.framesCaptured,
      coveragePercent: mappingState.coveragePercent,
      confidence: mappingState.confidence,
    });

    res.json({
      success: true,
      modelPath,
      generatedAt: mappingState.lastModelGeneratedAt,
      frameCount: mappingState.framesCaptured,
      coveragePercent: mappingState.coveragePercent,
      confidence: mappingState.confidence,
    });
  });

  app.get("/api/mapping/3d/model/latest", async (_req, res) => {
    if (!mappingState.lastModelPath) {
      return res.status(404).json({ success: false, error: "No 3D model generated yet" });
    }
    try {
      const content = await readFile(mappingState.lastModelPath, "utf-8");
      res.setHeader("Content-Type", "application/json");
      res.send(content);
    } catch {
      res.status(404).json({ success: false, error: "Latest model file is unavailable" });
    }
  });

  app.post("/api/mavlink/command", async (req, res) => {
    try {
      const { command, params } = req.body;
      if (!command) return res.status(400).json({ success: false, error: "command is required" });
      pushDebugEvent("info", "mavlink.command", "Command dispatch requested", {
        command,
        hasParams: Boolean(params && typeof params === "object"),
      });

      if (command === "gimbal_control") {
        const pitch = Math.max(-90, Math.min(30, Number(params?.pitch ?? -45)));
        const yaw = Math.max(-180, Math.min(180, Number(params?.yaw ?? 0)));
        const connectionString = String(req.query.connectionString || process.env.MAVLINK_CONNECTION || "").trim();

        if (connectionString) {
          const py = spawn(PYTHON_EXEC, [
            path.join(SCRIPTS_DIR, "mavlink_vehicle_control.py"),
            "--connection", connectionString,
            "--gimbal-pitch", String(pitch),
            "--gimbal-yaw", String(yaw),
          ]);
          let stdout = "", stderr = "";
          py.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
          py.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
          await new Promise<void>((resolve) => py.on("close", () => resolve()));
          pushDebugEvent("success", "mavlink.command", "Gimbal command pushed to MAVLink bridge", {
            command,
            hardware: true,
            connectionString,
            pitch,
            yaw,
            stderr: stderr.trim() || null,
          });
          return res.json({ success: true, command, pitch, yaw, output: stdout.trim(), hardware: true });
        }

        pushDebugEvent("warn", "mavlink.command", "Gimbal command queued without MAVLink connection", {
          command,
          hardware: false,
          pitch,
          yaw,
        });
        return res.json({ success: true, command, pitch, yaw, hardware: false, message: "Gimbal command queued (no MAVLink connection)" });
      }

      pushDebugEvent("warn", "mavlink.command", "Unknown command rejected", { command });
      return res.status(400).json({ success: false, error: `Unknown command: ${command}` });
    } catch (err: any) {
      pushDebugEvent("error", "mavlink.command", "Command dispatch failed", {
        error: err?.message || String(err),
      });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // MAVLink Parameter Manager API (ArduPilot/Cube+)
  app.get("/api/mavlink/params", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }

      const timeout = Math.max(3, Math.min(30, Number(req.query.timeout || 12)));
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_params.py"),
        "list",
        "--connection",
        connectionString,
        "--timeout",
        String(timeout),
      ]);

      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Parameter list failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid response from MAVLink bridge" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to fetch params" });
    }
  });

  app.get("/api/mavlink/params/:name", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }
      const name = String(req.params.name || "").trim().toUpperCase();
      if (!name) {
        return res.status(400).json({ success: false, error: "parameter name is required" });
      }

      const timeout = Math.max(3, Math.min(20, Number(req.query.timeout || 8)));
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_params.py"),
        "get",
        "--connection",
        connectionString,
        "--name",
        name,
        "--timeout",
        String(timeout),
      ]);

      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(404).json({ success: false, error: parsed?.error || err || "Parameter not found" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid response from MAVLink bridge" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to fetch parameter" });
    }
  });

  app.patch("/api/mavlink/params/:name", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || req.query.connectionString || "").trim();
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }

      const name = String(req.params.name || "").trim().toUpperCase();
      const value = Number(req.body?.value);
      if (!name || !Number.isFinite(value)) {
        return res.status(400).json({ success: false, error: "valid parameter name and numeric value required" });
      }

      const timeout = Math.max(3, Math.min(20, Number(req.body?.timeout || req.query.timeout || 8)));
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_params.py"),
        "set",
        "--connection",
        connectionString,
        "--name",
        name,
        "--value",
        String(value),
        "--timeout",
        String(timeout),
      ]);

      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Failed to set parameter" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid response from MAVLink bridge" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to set parameter" });
    }
  });

  app.post("/api/mavlink/params/import", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const params = Array.isArray(req.body?.params) ? req.body.params : [];
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }
      if (!params.length) {
        return res.status(400).json({ success: false, error: "params array is required" });
      }

      const applied: any[] = [];
      const failed: any[] = [];
      for (const p of params) {
        const name = String(p?.name || "").trim().toUpperCase();
        const value = Number(p?.value);
        if (!name || !Number.isFinite(value)) {
          failed.push({ name, value, error: "invalid input" });
          continue;
        }

        const py = spawn(PYTHON_EXEC, [
          path.join(SCRIPTS_DIR, "mavlink_params.py"),
          "set",
          "--connection",
          connectionString,
          "--name",
          name,
          "--value",
          String(value),
          "--timeout",
          "6",
        ]);
        let out = "";
        let err = "";
        await new Promise<void>((resolve) => {
          py.stdout.on("data", (d: Buffer) => (out += d.toString()));
          py.stderr.on("data", (d: Buffer) => (err += d.toString()));
          py.on("close", () => {
            try {
              const parsed = JSON.parse((out || "").trim() || "{}");
              if (parsed?.success) applied.push({ name, value: parsed.value });
              else failed.push({ name, value, error: parsed?.error || err || "set failed" });
            } catch {
              failed.push({ name, value, error: err || "invalid bridge response" });
            }
            resolve();
          });
        });
      }

      res.json({ success: true, applied, failed });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to import parameters" });
    }
  });

  app.get("/api/mavlink/params/export", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_params.py"),
        "list",
        "--connection",
        connectionString,
        "--timeout",
        "14",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) {
            return res.status(500).json({ success: false, error: parsed?.error || err || "Export failed" });
          }
          const payload = {
            exportedAt: new Date().toISOString(),
            connectionString,
            count: parsed.count || 0,
            params: parsed.params || [],
          };
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Content-Disposition", `attachment; filename=fc-params-${Date.now()}.json`);
          return res.send(JSON.stringify(payload, null, 2));
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid response from MAVLink bridge" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to export parameters" });
    }
  });

  app.post("/api/mavlink/params/compare", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const inputRaw = req.body?.params;
      const inputList = Array.isArray(inputRaw)
        ? inputRaw
        : inputRaw && typeof inputRaw === "object"
          ? Object.entries(inputRaw).map(([name, value]) => ({ name, value }))
          : [];
      if (!inputList.length) return res.status(400).json({ success: false, error: "params array/object is required" });
      const tolerance = Math.max(0, Number(req.body?.tolerance ?? 0.001));

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_params.py"),
        "list",
        "--connection",
        connectionString,
        "--timeout",
        "12",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) return res.status(500).json({ success: false, error: parsed?.error || err || "Failed to list FC params" });
          const fcParams = Array.isArray(parsed.params) ? parsed.params : [];
          const fcMap = new Map<string, number>();
          for (const item of fcParams) {
            const name = String(item?.name || "").toUpperCase();
            const value = Number(item?.value);
            if (name && Number.isFinite(value)) fcMap.set(name, value);
          }

          const mismatched: Array<{ name: string; expected: number; actual: number }> = [];
          const missingOnFc: Array<{ name: string; expected: number }> = [];
          const matched: Array<{ name: string; expected: number; actual: number }> = [];
          const inputNames = new Set<string>();

          for (const row of inputList) {
            const name = String(row?.name || "").trim().toUpperCase();
            const expected = Number(row?.value);
            if (!name || !Number.isFinite(expected)) continue;
            inputNames.add(name);
            const actual = fcMap.get(name);
            if (actual == null) {
              missingOnFc.push({ name, expected });
              continue;
            }
            if (Math.abs(actual - expected) > tolerance) mismatched.push({ name, expected, actual });
            else matched.push({ name, expected, actual });
          }

          const missingInInput = Array.from(fcMap.keys())
            .filter((name) => !inputNames.has(name))
            .slice(0, 200);

          res.json({
            success: true,
            tolerance,
            inputCount: inputNames.size,
            fcCount: fcMap.size,
            matchedCount: matched.length,
            mismatchCount: mismatched.length,
            missingOnFcCount: missingOnFc.length,
            missingInInputCount: missingInInput.length,
            mismatched,
            missingOnFc,
            missingInInput,
          });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid compare response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Parameter compare failed" });
    }
  });

  app.post("/api/mavlink/fence/upload", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const zones = Array.isArray(req.body?.zones) ? req.body.zones : [];
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }
      if (!zones.length) {
        return res.status(400).json({ success: false, error: "zones are required" });
      }

      const enabledZones = zones.filter((z: any) => z?.enabled !== false);
      if (!enabledZones.length) {
        return res.status(400).json({ success: false, error: "no enabled zones to upload" });
      }

      const primary = enabledZones[0];
      const toPoints = (zone: any): { lat: number; lng: number }[] => {
        if ((zone?.type === "custom" || zone?.type === "polygon") && Array.isArray(zone?.points)) {
          return zone.points
            .map((p: any) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
            .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        }
        if (zone?.type === "circle" && zone?.center && Number(zone?.radius) > 0) {
          const samples = 18;
          const lat = Number(zone.center.lat);
          const lng = Number(zone.center.lng);
          const radius = Number(zone.radius);
          const out: { lat: number; lng: number }[] = [];
          for (let i = 0; i < samples; i++) {
            const a = (Math.PI * 2 * i) / samples;
            const dLat = (radius * Math.cos(a)) / 111320;
            const dLng = (radius * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180));
            out.push({ lat: lat + dLat, lng: lng + dLng });
          }
          return out;
        }
        return [];
      };

      const points = toPoints(primary);
      if (points.length < 3) {
        return res.status(400).json({ success: false, error: "selected geofence cannot be converted to polygon points" });
      }

      const payload = {
        points,
        action: primary?.action || "warn",
        minAltitude: Number(primary?.minAltitude ?? 0),
        maxAltitude: Number(primary?.maxAltitude ?? 120),
        enable: true,
      };

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_fence.py"),
        "upload",
        "--connection",
        connectionString,
        "--timeout",
        "12",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.stdin.write(JSON.stringify(payload));
      py.stdin.end();
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) {
            return res.json({ success: true, uploadedPoints: parsed.uploadedPoints, zoneName: primary?.name || null });
          }
          return res.status(500).json({ success: false, error: parsed?.error || err || "Fence upload failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid response from fence bridge" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Fence upload failed" });
    }
  });

  app.get("/api/mavlink/fence/download", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_fence.py"),
        "download",
        "--connection",
        connectionString,
        "--timeout",
        "10",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) {
            return res.status(500).json({ success: false, error: parsed?.error || err || "Fence download failed" });
          }
          return res.json(parsed);
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid response from fence bridge" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Fence download failed" });
    }
  });

  app.post("/api/mavlink/mission/upload", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const waypoints = Array.isArray(req.body?.waypoints) ? req.body.waypoints : [];
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!waypoints.length) return res.status(400).json({ success: false, error: "waypoints are required" });

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_mission.py"),
        "upload",
        "--connection",
        connectionString,
        "--timeout",
        "14",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.stdin.write(JSON.stringify({ waypoints }));
      py.stdin.end();
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Mission upload failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid mission bridge response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Mission upload failed" });
    }
  });

  app.get("/api/mavlink/mission/download", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_mission.py"),
        "download",
        "--connection",
        connectionString,
        "--timeout",
        "14",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Mission download failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid mission bridge response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Mission download failed" });
    }
  });

  app.post("/api/mavlink/mission/validate", async (req, res) => {
    try {
      const waypoints = Array.isArray(req.body?.waypoints) ? req.body.waypoints : [];
      if (!waypoints.length) {
        return res.status(400).json({ success: false, error: "waypoints are required" });
      }

      const errors: string[] = [];
      waypoints.forEach((wp: any, idx: number) => {
        const n = idx + 1;
        const lat = Number(wp?.lat);
        const lng = Number(wp?.lng);
        const alt = Number(wp?.altitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(`WP ${n}: invalid latitude`);
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push(`WP ${n}: invalid longitude`);
        if (!Number.isFinite(alt) || alt < 0 || alt > 500) errors.push(`WP ${n}: altitude must be 0..500m`);
      });

      if (errors.length) {
        return res.status(400).json({ success: false, valid: false, errors });
      }

      res.json({ success: true, valid: true, count: waypoints.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Mission validation failed" });
    }
  });

  app.post("/api/mavlink/mission/diff", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const localWaypoints = Array.isArray(req.body?.waypoints) ? req.body.waypoints : [];
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!localWaypoints.length) return res.status(400).json({ success: false, error: "waypoints are required" });

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_mission.py"),
        "download",
        "--connection",
        connectionString,
        "--timeout",
        "12",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) {
            return res.status(500).json({ success: false, error: parsed?.error || err || "Failed to download FC mission" });
          }

          const fcWaypoints = Array.isArray(parsed.waypoints) ? parsed.waypoints : [];
          const maxLen = Math.max(fcWaypoints.length, localWaypoints.length);
          const changes: any[] = [];
          const eq = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

          for (let i = 0; i < maxLen; i++) {
            const local = localWaypoints[i];
            const fc = fcWaypoints[i];
            if (!local && fc) {
              changes.push({ order: i + 1, type: "remove_from_fc", fc });
              continue;
            }
            if (local && !fc) {
              changes.push({ order: i + 1, type: "add_to_fc", local });
              continue;
            }
            const localLat = Number(local?.lat);
            const localLng = Number(local?.lng);
            const localAlt = Number(local?.altitude);
            const fcLat = Number(fc?.lat);
            const fcLng = Number(fc?.lng);
            const fcAlt = Number(fc?.altitude);
            const localAction = String(local?.action || "flythrough");
            const fcAction = String(fc?.action || "flythrough");
            const changed =
              !eq(localLat, fcLat, 0.00001) ||
              !eq(localLng, fcLng, 0.00001) ||
              !eq(localAlt, fcAlt, 0.5) ||
              localAction !== fcAction;
            if (changed) {
              changes.push({
                order: i + 1,
                type: "update",
                local: { lat: localLat, lng: localLng, altitude: localAlt, action: localAction },
                fc: { lat: fcLat, lng: fcLng, altitude: fcAlt, action: fcAction },
              });
            }
          }

          res.json({
            success: true,
            identical: changes.length === 0,
            localCount: localWaypoints.length,
            fcCount: fcWaypoints.length,
            changes,
          });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid mission diff response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Mission diff failed" });
    }
  });

  app.post("/api/mavlink/rally/upload", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const points = Array.isArray(req.body?.points) ? req.body.points : [];
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_rally.py"),
        "upload",
        "--connection",
        connectionString,
        "--timeout",
        "12",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.stdin.write(JSON.stringify({ points }));
      py.stdin.end();
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Rally upload failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid rally bridge response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Rally upload failed" });
    }
  });

  app.get("/api/mavlink/rally/download", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_rally.py"),
        "download",
        "--connection",
        connectionString,
        "--timeout",
        "12",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Rally download failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid rally bridge response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Rally download failed" });
    }
  });

  app.get("/api/mavlink/calibration/status", async (_req, res) => {
    res.json({ success: true, calibration: calibrationState });
  });

  app.post("/api/mavlink/calibration/start", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const mode = String(req.body?.mode || "").trim().toLowerCase();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!["compass", "accel", "radio", "esc", "gyro", "baro", "level"].includes(mode)) {
        return res.status(400).json({ success: false, error: "mode must be compass|accel|radio|esc|gyro|baro|level" });
      }

      calibrationState[mode].status = "running";
      calibrationState[mode].lastRunAt = new Date().toISOString();
      calibrationState[mode].message = "Calibration command sent";

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_calibration.py"),
        "start",
        "--connection",
        connectionString,
        "--mode",
        mode,
        "--timeout",
        "10",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) {
            calibrationState[mode].status = "completed";
            calibrationState[mode].ack = parsed.ack ?? null;
            calibrationState[mode].message = "Calibration accepted";
            void appendCloudDocument("calibration_events", { mode, status: "completed", connectionString, ack: parsed.ack ?? null, timestamp: new Date().toISOString() }, { session: requestSession(req) }).catch(() => {});
            return res.json({ success: true, mode, ack: parsed.ack ?? null });
          }
          calibrationState[mode].status = "failed";
          calibrationState[mode].message = parsed?.error || err || "Calibration failed";
          return res.status(500).json({ success: false, error: calibrationState[mode].message });
        } catch {
          calibrationState[mode].status = "failed";
          calibrationState[mode].message = err || "Invalid calibration bridge response";
          return res.status(500).json({ success: false, error: calibrationState[mode].message });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Calibration start failed" });
    }
  });

  app.post("/api/mavlink/calibration/cancel", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_calibration.py"),
        "cancel",
        "--connection",
        connectionString,
        "--timeout",
        "8",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) {
            for (const m of ["compass", "accel", "radio", "esc", "gyro", "baro", "level"]) {
              calibrationState[m].status = "idle";
              calibrationState[m].message = "Cancelled/reset";
              calibrationState[m].ack = parsed.ack ?? null;
            }
            return res.json({ success: true, ack: parsed.ack ?? null });
          }
          return res.status(500).json({ success: false, error: parsed?.error || err || "Cancel failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid calibration bridge response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Calibration cancel failed" });
    }
  });

  app.get("/api/mavlink/mode-mapping", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const names = [
        "FLTMODE1",
        "FLTMODE2",
        "FLTMODE3",
        "FLTMODE4",
        "FLTMODE5",
        "FLTMODE6",
        "MODE_CH",
        "RCMAP_ROLL",
        "RCMAP_PITCH",
        "RCMAP_THROTTLE",
        "RCMAP_YAW",
      ];
      const mapping: Record<string, number | null> = {};
      for (const name of names) {
        const result = await runMavlinkParamBridge(["get", "--connection", connectionString, "--name", name, "--timeout", "6"]);
        mapping[name] = result.ok ? Number(result.data?.value) : null;
      }
      res.json({ success: true, mapping });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to read mode mapping" });
    }
  });

  app.post("/api/mavlink/mode-mapping/apply", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const mapping = req.body?.mapping || {};
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const entries = Object.entries(mapping).filter(([k, v]) => typeof v === "number");
      if (!entries.length) return res.status(400).json({ success: false, error: "mapping values are required" });

      const applied: any[] = [];
      const failed: any[] = [];
      for (const [name, value] of entries) {
        const result = await runMavlinkParamBridge([
          "set",
          "--connection",
          connectionString,
          "--name",
          String(name).toUpperCase(),
          "--value",
          String(Number(value)),
          "--timeout",
          "6",
        ]);
        if (result.ok) applied.push({ name, value: Number(result.data?.value ?? value) });
        else failed.push({ name, value, error: result.error || "set failed" });
      }

      res.json({ success: true, applied, failed });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to apply mode mapping" });
    }
  });

  const copterAirframeProfiles: Record<string, { name: string; firmware: string; params: Record<string, number>; notes: string[] }> = {
    quad_x: {
      name: "Quadcopter X",
      firmware: "ArduCopter",
      params: {
        FRAME_CLASS: 1,
        FRAME_TYPE: 1,
        MOT_PWM_TYPE: 6,
      },
      notes: ["Requires motor re-check and ESC recalibration after frame change."],
    },
    hexa_x: {
      name: "Hexacopter X",
      firmware: "ArduCopter",
      params: {
        FRAME_CLASS: 2,
        FRAME_TYPE: 1,
        MOT_PWM_TYPE: 6,
      },
      notes: ["Verify power system and motor order for 6-motor layout."],
    },
    octa_x: {
      name: "Octocopter X",
      firmware: "ArduCopter",
      params: {
        FRAME_CLASS: 3,
        FRAME_TYPE: 1,
        MOT_PWM_TYPE: 6,
      },
      notes: ["Recommended for heavy lift; verify ESC protocol on all channels."],
    },
  };

  app.get("/api/mavlink/airframe/profiles", async (_req, res) => {
    res.json({ success: true, profiles: copterAirframeProfiles });
  });

  app.get("/api/stabilization/frame-geometries", async (_req, res) => {
    const { FRAME_GEOMETRIES } = await import("./flightDynamics");
    res.json({ success: true, geometries: FRAME_GEOMETRIES });
  });

  app.post("/api/mavlink/airframe/apply", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const profileId = String(req.body?.profileId || "").trim().toLowerCase();
      const rebootAfter = req.body?.rebootAfter !== false;
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const profile = copterAirframeProfiles[profileId];
      if (!profile) return res.status(400).json({ success: false, error: "Unknown airframe profile" });

      const applied: any[] = [];
      const failed: any[] = [];
      for (const [key, value] of Object.entries(profile.params)) {
        const result = await runMavlinkParamBridge([
          "set",
          "--connection",
          connectionString,
          "--name",
          String(key).toUpperCase(),
          "--value",
          String(Number(value)),
          "--timeout",
          "6",
        ]);
        if (result.ok) applied.push({ name: key, value: Number(result.data?.value ?? value) });
        else failed.push({ name: key, value, error: result.error || "set failed" });
      }

      let reboot = null as null | { success: boolean; error?: string };
      if (rebootAfter) {
        const rebootResult = await runMavlinkVehicleControl([
          "action",
          "--connection",
          connectionString,
          "--action",
          "reboot",
          "--timeout",
          "6",
        ]);
        reboot = rebootResult.ok ? { success: true } : { success: false, error: rebootResult.error || "reboot failed" };
      }

      res.json({
        success: true,
        profileId,
        profileName: profile.name,
        firmware: profile.firmware,
        applied,
        failed,
        reboot,
        notes: profile.notes,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to apply airframe profile" });
    }
  });

  app.post("/api/mavlink/airframe/reconfigure", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const profileId = String(req.body?.profileId || "").trim().toLowerCase();
      const optionalProfiles = Array.isArray(req.body?.optionalProfiles)
        ? req.body.optionalProfiles.map((x: any) => String(x || "").trim()).filter(Boolean)
        : [];
      const rebootAfter = req.body?.rebootAfter !== false;
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const profile = copterAirframeProfiles[profileId];
      if (!profile) return res.status(400).json({ success: false, error: "Unknown airframe profile" });

      const baseApplied: any[] = [];
      const baseFailed: any[] = [];
      for (const [key, value] of Object.entries(profile.params)) {
        const result = await runMavlinkParamBridge([
          "set",
          "--connection",
          connectionString,
          "--name",
          String(key).toUpperCase(),
          "--value",
          String(Number(value)),
          "--timeout",
          "6",
        ]);
        if (result.ok) baseApplied.push({ name: key, value: Number(result.data?.value ?? value) });
        else baseFailed.push({ name: key, value, error: result.error || "set failed" });
      }

      const optionalApplied: Array<{ profileId: string; name: string; value: number }> = [];
      const optionalFailed: Array<{ profileId: string; name: string; value: number; error: string }> = [];
      for (const optionalProfileId of optionalProfiles) {
        const p = OPTIONAL_HARDWARE_PROFILES[optionalProfileId];
        if (!p) {
          optionalFailed.push({ profileId: optionalProfileId, name: "*", value: 0, error: "profile not found" });
          continue;
        }
        for (const item of p) {
          const result = await runMavlinkParamBridge([
            "set",
            "--connection",
            connectionString,
            "--name",
            item.name,
            "--value",
            String(item.value),
            "--timeout",
            "6",
          ]);
          if (result.ok) optionalApplied.push({ profileId: optionalProfileId, name: item.name, value: item.value });
          else optionalFailed.push({ profileId: optionalProfileId, name: item.name, value: item.value, error: result.error || "set failed" });
        }
      }

      let reboot = null as null | { success: boolean; error?: string };
      if (rebootAfter) {
        const rebootResult = await runMavlinkVehicleControl([
          "action",
          "--connection",
          connectionString,
          "--action",
          "reboot",
          "--timeout",
          "8",
        ]);
        reboot = rebootResult.ok ? { success: true } : { success: false, error: rebootResult.error || "reboot failed" };
      }

      res.json({
        success: true,
        profileId,
        profileName: profile.name,
        baseApplied,
        baseFailed,
        optionalProfiles,
        optionalApplied,
        optionalFailed,
        reboot,
        checklist: [
          "Run accelerometer + compass calibration",
          "Run radio and ESC calibration",
          "Verify motor order before arming",
          "Confirm frame type in HUD after reboot",
        ],
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to run airframe reconfigure workflow" });
    }
  });

  app.post("/api/mavlink/vehicle/action", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const action = String(req.body?.action || "").trim().toLowerCase();
      const mode = String(req.body?.mode || "").trim().toUpperCase();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!["arm", "disarm", "set_mode", "reboot"].includes(action)) {
        return res.status(400).json({ success: false, error: "action must be arm|disarm|set_mode|reboot" });
      }
      if (action === "set_mode" && !mode) {
        return res.status(400).json({ success: false, error: "mode is required for set_mode" });
      }

      pushDebugEvent("info", "mavlink.vehicle_action", "Vehicle action dispatch requested", {
        action,
        mode: mode || null,
        connectionString,
      });
      const args = ["action", "--connection", connectionString, "--action", action, "--timeout", "8"];
      if (mode) args.push("--mode", mode);
      const result = await runMavlinkVehicleControl(args);
      if (!result.ok) {
        pushDebugEvent("error", "mavlink.vehicle_action", "Vehicle action failed", {
          action,
          mode: mode || null,
          connectionString,
          error: result.error || "Vehicle action failed",
        });
        return res.status(500).json({ success: false, error: result.error || "Vehicle action failed" });
      }
      void publishCloudRealtime("vehicle_command", { connectionString, action, mode: mode || null, result: result.data }).catch(() => {});
      void appendCloudDocument("vehicle_commands", { connectionString, action, mode: mode || null, result: result.data, timestamp: new Date().toISOString() }, { session: requestSession(req) }).catch(() => {});
      pushDebugEvent("success", "mavlink.vehicle_action", "Vehicle action dispatched successfully", {
        action,
        mode: mode || null,
        connectionString,
        ack: result.data?.ack ?? null,
      });
      res.json({ success: true, result: result.data });
    } catch (error: any) {
      pushDebugEvent("error", "mavlink.vehicle_action", "Vehicle action failed with exception", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Vehicle action failed" });
    }
  });

  app.post("/api/mavlink/manual-control", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      const x = Number(req.body?.x ?? 0);
      const y = Number(req.body?.y ?? 0);
      const z = Number(req.body?.z ?? 500);
      const r = Number(req.body?.r ?? 0);
      const buttons = Number(req.body?.buttons ?? 0);
      const durationMs = Number(req.body?.durationMs ?? 400);

      const result = await runMavlinkVehicleControl([
        "manual",
        "--connection",
        connectionString,
        "--x",
        String(Number.isFinite(x) ? x : 0),
        "--y",
        String(Number.isFinite(y) ? y : 0),
        "--z",
        String(Number.isFinite(z) ? z : 500),
        "--r",
        String(Number.isFinite(r) ? r : 0),
        "--buttons",
        String(Number.isFinite(buttons) ? buttons : 0),
        "--duration-ms",
        String(Number.isFinite(durationMs) ? durationMs : 400),
        "--timeout",
        "6",
      ]);

      if (!result.ok) return res.status(500).json({ success: false, error: result.error || "Manual control failed" });
      void publishCloudRealtime("manual_control", { connectionString, x: Number(x), y: Number(y), z: Number(z), r: Number(r) }).catch(() => {});
      res.json({ success: true, result: result.data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Manual control failed" });
    }
  });

  app.post("/api/mavlink/swarm/action", async (req, res) => {
    try {
      const connectionStrings = Array.isArray(req.body?.connectionStrings)
        ? req.body.connectionStrings.map((v: any) => String(v || "").trim()).filter(Boolean)
        : [];
      const action = String(req.body?.action || "").trim().toLowerCase();
      const mode = String(req.body?.mode || "").trim().toUpperCase();
      if (!connectionStrings.length) return res.status(400).json({ success: false, error: "connectionStrings are required" });
      if (!["arm", "disarm", "set_mode"].includes(action)) {
        return res.status(400).json({ success: false, error: "action must be arm|disarm|set_mode" });
      }
      if (action === "set_mode" && !mode) {
        return res.status(400).json({ success: false, error: "mode is required for set_mode" });
      }

      pushDebugEvent("info", "mavlink.swarm_action", "Swarm action dispatch requested", {
        action,
        mode: mode || null,
        targetCount: connectionStrings.length,
      });
      const results: Array<{ connectionString: string; success: boolean; ack?: number | null; error?: string }> = [];
      for (const connectionString of connectionStrings) {
        const args = ["action", "--connection", connectionString, "--action", action, "--timeout", "8"];
        if (mode) args.push("--mode", mode);
        const result = await runMavlinkVehicleControl(args);
        if (result.ok) {
          results.push({
            connectionString,
            success: true,
            ack: result.data?.ack ?? null,
          });
        } else {
          results.push({
            connectionString,
            success: false,
            error: result.error || "action failed",
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const payload = {
        success: successCount > 0,
        action,
        mode: mode || null,
        successCount,
        total: results.length,
        results,
      };
      void appendCloudDocument("swarm_actions", payload, { session: requestSession(req) }).catch(() => {});
      void publishCloudRealtime("swarm_action", payload).catch(() => {});
      pushDebugEvent(payload.success ? "success" : "warn", "mavlink.swarm_action", "Swarm action dispatch completed", {
        action,
        mode: mode || null,
        successCount,
        total: results.length,
      });
      res.json(payload);
    } catch (error: any) {
      pushDebugEvent("error", "mavlink.swarm_action", "Swarm action dispatch failed", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Swarm action failed" });
    }
  });

  app.post("/api/mavlink/swarm/formation-plan", async (req, res) => {
    try {
      const count = Math.max(1, Math.min(24, Number(req.body?.count || 1)));
      const formation = String(req.body?.formation || "line").trim().toLowerCase();
      const spacing = Math.max(1, Number(req.body?.spacingMeters || 10));
      const originLat = Number(req.body?.originLat || 0);
      const originLng = Number(req.body?.originLng || 0);
      if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
        return res.status(400).json({ success: false, error: "originLat and originLng are required" });
      }
      const metersToLat = (m: number) => m / 111320;
      const metersToLng = (m: number, atLat: number) => m / (111320 * Math.cos((atLat * Math.PI) / 180));
      const slots: Array<{ idx: number; offsetNorthM: number; offsetEastM: number; lat: number; lng: number }> = [];
      for (let i = 0; i < count; i++) {
        let north = 0;
        let east = 0;
        if (formation === "line") {
          east = i * spacing;
        } else if (formation === "column") {
          north = i * spacing;
        } else if (formation === "wedge") {
          if (i === 0) {
            north = 0;
            east = 0;
          } else {
            const rank = Math.ceil(i / 2);
            north = rank * spacing;
            east = (i % 2 === 0 ? -1 : 1) * rank * spacing;
          }
        } else if (formation === "grid") {
          const side = Math.ceil(Math.sqrt(count));
          const row = Math.floor(i / side);
          const col = i % side;
          north = row * spacing;
          east = col * spacing;
        }
        slots.push({
          idx: i + 1,
          offsetNorthM: north,
          offsetEastM: east,
          lat: originLat + metersToLat(north),
          lng: originLng + metersToLng(east, originLat),
        });
      }
      res.json({ success: true, formation, count, spacingMeters: spacing, origin: { lat: originLat, lng: originLng }, slots });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Formation planning failed" });
    }
  });

  app.post("/api/mavlink/swarm/sync-action", async (req, res) => {
    try {
      const connectionStrings = Array.isArray(req.body?.connectionStrings)
        ? req.body.connectionStrings.map((v: any) => String(v || "").trim()).filter(Boolean)
        : [];
      const action = String(req.body?.action || "").trim().toLowerCase();
      const mode = String(req.body?.mode || "").trim().toUpperCase();
      const staggerMs = Math.max(0, Number(req.body?.staggerMs || 0));
      if (!connectionStrings.length) return res.status(400).json({ success: false, error: "connectionStrings are required" });
      if (!["arm", "disarm", "set_mode", "reboot"].includes(action)) {
        return res.status(400).json({ success: false, error: "action must be arm|disarm|set_mode|reboot" });
      }

      pushDebugEvent("info", "mavlink.swarm_sync_action", "Synchronized swarm action dispatch requested", {
        action,
        mode: mode || null,
        targetCount: connectionStrings.length,
        staggerMs,
      });
      const startedAt = Date.now();
      const results: Array<{ connectionString: string; success: boolean; error?: string; delayMs: number }> = [];
      for (let i = 0; i < connectionStrings.length; i++) {
        if (i > 0 && staggerMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, staggerMs));
        }
        const conn = connectionStrings[i];
        const args = ["action", "--connection", conn, "--action", action, "--timeout", "8"];
        if (mode) args.push("--mode", mode);
        const result = await runMavlinkVehicleControl(args);
        results.push({
          connectionString: conn,
          success: result.ok,
          error: result.ok ? undefined : (result.error || "action failed"),
          delayMs: Date.now() - startedAt,
        });
      }
      const payload = { success: true, action, mode: mode || null, staggerMs, results };
      void appendCloudDocument("swarm_actions", payload, { session: requestSession(req) }).catch(() => {});
      void publishCloudRealtime("swarm_sync_action", payload).catch(() => {});
      pushDebugEvent("success", "mavlink.swarm_sync_action", "Synchronized swarm action dispatch completed", {
        action,
        mode: mode || null,
        staggerMs,
        total: results.length,
        successCount: results.filter((r) => r.success).length,
      });
      res.json(payload);
    } catch (error: any) {
      pushDebugEvent("error", "mavlink.swarm_sync_action", "Synchronized swarm action dispatch failed", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Swarm sync action failed" });
    }
  });

  app.post("/api/mavlink/swarm/formation-mission", async (req, res) => {
    try {
      const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];
      const altitude = Number(req.body?.altitude || 40);
      const holdSec = Number(req.body?.holdSec || 6);
      const missions = slots
        .map((slot: any, idx: number) => ({
          vehicle: String(slot.vehicle || slot.connectionString || `vehicle-${idx + 1}`),
          connectionString: String(slot.connectionString || "").trim(),
          mission: [
            { order: 1, lat: Number(slot.lat), lng: Number(slot.lng), altitude, action: "takeoff", actionParams: { frame: "relative" } },
            { order: 2, lat: Number(slot.lat), lng: Number(slot.lng), altitude, action: "hover", actionParams: { hoverTime: holdSec, frame: "relative" } },
          ],
        }))
        .filter((m: any) => Number.isFinite(m.mission[0].lat) && Number.isFinite(m.mission[0].lng));
      const payload = { success: true, count: missions.length, missions };
      void appendCloudDocument("swarm_formation_missions", payload, { session: requestSession(req) }).catch(() => {});
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Formation mission generation failed" });
    }
  });

  app.get("/api/mavlink/optional-hardware/profiles", async (_req, res) => {
    res.json({ success: true, profiles: OPTIONAL_HARDWARE_PROFILES });
  });

  app.post("/api/mavlink/optional-hardware/apply", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const profileId = String(req.body?.profileId || "").trim();
      if (!connectionString || !profileId) return res.status(400).json({ success: false, error: "connectionString and profileId are required" });
      const profile = OPTIONAL_HARDWARE_PROFILES[profileId];
      if (!profile) return res.status(404).json({ success: false, error: "profile not found" });
      const applied: any[] = [];
      const failed: any[] = [];
      for (const item of profile) {
        const result = await runMavlinkParamBridge([
          "set",
          "--connection",
          connectionString,
          "--name",
          item.name,
          "--value",
          String(item.value),
          "--timeout",
          "6",
        ]);
        if (result.ok) applied.push(item);
        else failed.push({ ...item, error: result.error || "set failed" });
      }
      res.json({ success: true, profileId, applied, failed });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to apply optional hardware profile" });
    }
  });

  app.get("/api/mavlink/radio-sik/status", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      const serialPort = Math.max(1, Math.min(8, Number(req.query.serialPort || 1)));
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      const keys = [
        `SERIAL${serialPort}_PROTOCOL`,
        `SERIAL${serialPort}_BAUD`,
        `SR${serialPort}_RAW_SENS`,
        `SR${serialPort}_EXT_STAT`,
        `SR${serialPort}_RC_CHAN`,
        `SR${serialPort}_POSITION`,
        `SR${serialPort}_EXTRA1`,
        `SR${serialPort}_EXTRA2`,
        `SR${serialPort}_EXTRA3`,
        "TELEM_DELAY",
      ];
      const values: Record<string, number | null> = {};
      for (const key of keys) {
        const result = await runMavlinkParamBridge(["get", "--connection", connectionString, "--name", key, "--timeout", "5"]);
        values[key] = result.ok ? Number(result.data?.value) : null;
      }
      res.json({ success: true, serialPort, values });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to read SiK status" });
    }
  });

  const buildSikProfileParams = (serialPort: number, profile: string) => {
    const baseByProfile: Record<string, Record<string, number>> = {
      long_range: {
        [`SERIAL${serialPort}_PROTOCOL`]: 2,
        [`SERIAL${serialPort}_BAUD`]: 57,
        [`SR${serialPort}_POSITION`]: 2,
        [`SR${serialPort}_EXTRA1`]: 2,
        [`SR${serialPort}_EXTRA2`]: 2,
        [`SR${serialPort}_EXTRA3`]: 2,
        [`SR${serialPort}_RC_CHAN`]: 2,
        "TELEM_DELAY": 0,
      },
      low_latency: {
        [`SERIAL${serialPort}_PROTOCOL`]: 2,
        [`SERIAL${serialPort}_BAUD`]: 115,
        [`SR${serialPort}_POSITION`]: 8,
        [`SR${serialPort}_EXTRA1`]: 8,
        [`SR${serialPort}_EXTRA2`]: 8,
        [`SR${serialPort}_EXTRA3`]: 6,
        [`SR${serialPort}_RC_CHAN`]: 6,
        "TELEM_DELAY": 0,
      },
    };
    return baseByProfile[profile] || null;
  };

  app.post("/api/mavlink/radio-sik/apply", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const serialPort = Math.max(1, Math.min(8, Number(req.body?.serialPort || 1)));
      const profile = String(req.body?.profile || "long_range").trim().toLowerCase();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      const selected = buildSikProfileParams(serialPort, profile);
      if (!selected) {
        return res.status(400).json({ success: false, error: "profile must be long_range|low_latency" });
      }

      const overrides = req.body?.overrides && typeof req.body.overrides === "object" ? req.body.overrides : {};
      const merged = { ...selected, ...overrides };

      const applied: any[] = [];
      const failed: any[] = [];
      for (const [key, value] of Object.entries(merged)) {
        const result = await runMavlinkParamBridge([
          "set",
          "--connection",
          connectionString,
          "--name",
          String(key).toUpperCase(),
          "--value",
          String(Number(value)),
          "--timeout",
          "6",
        ]);
        if (result.ok) applied.push({ name: key, value: Number(result.data?.value ?? value) });
        else failed.push({ name: key, value, error: result.error || "set failed" });
      }

      res.json({ success: true, serialPort, profile, applied, failed });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to apply SiK profile" });
    }
  });

  app.post("/api/mavlink/radio-sik/apply-verify", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const serialPort = Math.max(1, Math.min(8, Number(req.body?.serialPort || 1)));
      const profile = String(req.body?.profile || "long_range").trim().toLowerCase();
      const verifyDelayMs = Math.max(100, Math.min(5000, Number(req.body?.verifyDelayMs || 700)));
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const selected = buildSikProfileParams(serialPort, profile);
      if (!selected) {
        return res.status(400).json({ success: false, error: "profile must be long_range|low_latency" });
      }

      const overrides = req.body?.overrides && typeof req.body.overrides === "object" ? req.body.overrides : {};
      const merged = { ...selected, ...overrides };
      const applied: any[] = [];
      const failed: any[] = [];
      for (const [key, value] of Object.entries(merged)) {
        const result = await runMavlinkParamBridge([
          "set",
          "--connection",
          connectionString,
          "--name",
          String(key).toUpperCase(),
          "--value",
          String(Number(value)),
          "--timeout",
          "6",
        ]);
        if (result.ok) applied.push({ name: key, value: Number(result.data?.value ?? value) });
        else failed.push({ name: key, value, error: result.error || "set failed" });
      }

      await new Promise((resolve) => setTimeout(resolve, verifyDelayMs));
      const verified: Record<string, number | null> = {};
      const mismatches: Array<{ name: string; expected: number; actual: number | null }> = [];
      for (const [key, expected] of Object.entries(merged)) {
        const result = await runMavlinkParamBridge(["get", "--connection", connectionString, "--name", key, "--timeout", "5"]);
        const actual = result.ok ? Number(result.data?.value) : null;
        verified[key] = actual;
        if (actual === null || Math.abs(Number(actual) - Number(expected)) > 0.01) {
          mismatches.push({ name: key, expected: Number(expected), actual });
        }
      }

      res.json({
        success: true,
        serialPort,
        profile,
        applied,
        failed,
        verified,
        mismatches,
        verifiedOk: mismatches.length === 0,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to apply+verify SiK profile" });
    }
  });

  app.post("/api/mavlink/radio-sik/modem-query", async (req, res) => {
    try {
      const port = String(req.body?.port || "").trim();
      const command = String(req.body?.command || "ATI").trim();
      if (!port) return res.status(400).json({ success: false, error: "port is required" });
      const template = process.env.MOUSE_SIK_AT_CMD || "";
      if (!template.trim()) {
        return res.status(503).json({
          success: false,
          error: "MOUSE_SIK_AT_CMD is not configured",
          example: "python3 /opt/mouse/tools/sik_at.py --port {port} --cmd '{cmd}'",
        });
      }
      const cmd = template.replace(/\{port\}/g, port).replace(/\{cmd\}/g, command.replace(/'/g, ""));
      const proc = spawn("/bin/zsh", ["-lc", cmd], { cwd: process.cwd(), env: process.env });
      let out = "";
      let err = "";
      proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
      proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
      proc.on("close", (code) => {
        res.json({
          success: code === 0,
          port,
          command,
          stdout: out.trim(),
          stderr: err.trim(),
          code,
        });
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "SiK modem query failed" });
    }
  });

  app.get("/api/mavlink/radio-sik/modem-profiles", async (_req, res) => {
    res.json({ success: true, profiles: SIK_MODEM_PROFILES });
  });

  app.post("/api/mavlink/radio-sik/modem-apply-profile", async (req, res) => {
    try {
      const port = String(req.body?.port || "").trim();
      const profileId = String(req.body?.profileId || "").trim();
      if (!port || !profileId) return res.status(400).json({ success: false, error: "port and profileId are required" });
      const template = process.env.MOUSE_SIK_AT_CMD || "";
      if (!template.trim()) return res.status(503).json({ success: false, error: "MOUSE_SIK_AT_CMD is not configured" });
      const cmds = SIK_MODEM_PROFILES[profileId];
      if (!cmds) return res.status(404).json({ success: false, error: "modem profile not found" });

      const results: Array<{ command: string; success: boolean; stdout: string; stderr: string; code: number | null }> = [];
      for (const c of cmds) {
        const cmd = template.replace(/\{port\}/g, port).replace(/\{cmd\}/g, c.replace(/'/g, ""));
        const result = await new Promise<{ success: boolean; stdout: string; stderr: string; code: number | null }>((resolve) => {
          const proc = spawn("/bin/zsh", ["-lc", cmd], { cwd: process.cwd(), env: process.env });
          let out = "";
          let err = "";
          proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
          proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
          proc.on("close", (code) => resolve({ success: code === 0, stdout: out.trim(), stderr: err.trim(), code }));
        });
        results.push({ command: c, ...result });
      }
      const failed = results.filter((r) => !r.success);
      res.json({ success: failed.length === 0, port, profileId, results, failedCount: failed.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "SiK modem profile apply failed" });
    }
  });

  app.get("/api/mavlink/inspector/snapshot", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const timeout = Math.max(2, Math.min(12, Number(req.query.timeout || 6)));
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_inspector.py"),
        "--connection",
        connectionString,
        "--timeout",
        String(timeout),
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Inspector snapshot failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid inspector response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Inspector snapshot failed" });
    }
  });

  app.get("/api/mavlink/inspector/live", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const timeout = Math.max(2, Math.min(12, Number(req.query.timeout || 6)));
      const duration = Math.max(0.5, Math.min(5, Number(req.query.duration || 2)));
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_inspector.py"),
        "--connection",
        connectionString,
        "--timeout",
        String(timeout),
        "--live",
        "--duration",
        String(duration),
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Inspector live stream failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid inspector live response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Inspector live stream failed" });
    }
  });

  app.get("/api/mavlink/serial-passthrough/status", async (_req, res) => {
    res.json({ success: true, state: serialPassthroughState });
  });

  app.post("/api/mavlink/serial-passthrough/start", async (req, res) => {
    try {
      if (serialPassthroughProcess) return res.status(409).json({ success: false, error: "Serial passthrough already running" });
      const connectionString = String(req.body?.connectionString || "").trim();
      const localPort = Number(req.body?.localPort || 5760);
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!Number.isFinite(localPort) || localPort < 1 || localPort > 65535) {
        return res.status(400).json({ success: false, error: "localPort must be 1..65535" });
      }

      const template = process.env.MOUSE_SERIAL_PASSTHROUGH_CMD || "";
      if (!template.trim()) {
        return res.status(503).json({
          success: false,
          error: "MOUSE_SERIAL_PASSTHROUGH_CMD is not configured",
          example: "mavproxy.py --master={conn} --out=udp:127.0.0.1:{port}",
        });
      }

      const cmd = template
        .replace(/\{conn\}/g, connectionString)
        .replace(/\{port\}/g, String(localPort));
      const child = spawn("/bin/zsh", ["-lc", cmd], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "ignore",
      });
      serialPassthroughProcess = child;
      serialPassthroughState.running = true;
      serialPassthroughState.command = cmd;
      serialPassthroughState.startedAt = new Date().toISOString();
      serialPassthroughState.message = `Running on local port ${localPort}`;

      child.on("exit", () => {
        serialPassthroughProcess = null;
        serialPassthroughState.running = false;
        serialPassthroughState.message = "Stopped";
      });

      res.json({ success: true, state: serialPassthroughState });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to start serial passthrough" });
    }
  });

  app.post("/api/mavlink/serial-passthrough/stop", async (_req, res) => {
    try {
      if (serialPassthroughProcess) {
        serialPassthroughProcess.kill("SIGTERM");
        serialPassthroughProcess = null;
      }
      serialPassthroughState.running = false;
      serialPassthroughState.message = "Stopped";
      res.json({ success: true, state: serialPassthroughState });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to stop serial passthrough" });
    }
  });

  const startRtkNtripProcess = (
    host: string,
    port: number,
    mountpoint: string,
    username: string,
    password: string,
    connectionString: string,
  ): { ok: boolean; error?: string } => {
    if (rtkNtripProcess) return { ok: false, error: "RTK/NTRIP already running" };
    const template = process.env.MOUSE_NTRIP_CLIENT_CMD || "";
    if (!template.trim()) {
      return {
        ok: false,
        error: "MOUSE_NTRIP_CLIENT_CMD is not configured (example: str2str -in ntrip://{user}:{pass}@{host}:{port}/{mount} -out serial://{conn})",
      };
    }
    const cmd = template
      .replace(/\{host\}/g, host)
      .replace(/\{port\}/g, String(port))
      .replace(/\{mount\}/g, mountpoint)
      .replace(/\{user\}/g, username)
      .replace(/\{pass\}/g, password)
      .replace(/\{conn\}/g, connectionString);
    const child = spawn("/bin/zsh", ["-lc", cmd], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    });
    rtkNtripProcess = child;
    rtkNtripState.running = true;
    rtkNtripState.command = cmd;
    rtkNtripState.startedAt = new Date().toISOString();
    rtkNtripState.host = host;
    rtkNtripState.port = port;
    rtkNtripState.mountpoint = mountpoint;
    rtkNtripState.message = "RTK/NTRIP streaming active";
    child.on("exit", () => {
      rtkNtripProcess = null;
      rtkNtripState.running = false;
      rtkNtripState.message = "Stopped";
    });
    return { ok: true };
  };

  app.get("/api/mavlink/rtk/profiles", async (_req, res) => {
    try {
      const profiles = await readRtkProfiles();
      res.json({ success: true, profiles });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to list RTK profiles" });
    }
  });

  app.get("/api/mavlink/rtk/profiles/export", async (_req, res) => {
    try {
      const profiles = await readRtkProfiles();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="rtk-profiles-${Date.now()}.json"`);
      res.send(JSON.stringify({ profiles }, null, 2));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to export RTK profiles" });
    }
  });

  app.post("/api/mavlink/rtk/profiles", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const host = String(req.body?.host || "").trim();
      const port = Number(req.body?.port || 2101);
      const mountpoint = String(req.body?.mountpoint || "").trim();
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "").trim();
      const id = String(req.body?.id || "").trim();
      if (!name || !host || !mountpoint) {
        return res.status(400).json({ success: false, error: "name, host, and mountpoint are required" });
      }

      const profiles = await readRtkProfiles();
      const now = new Date().toISOString();
      const profileId = id || `rtk-${Date.now()}`;
      const existingIdx = profiles.findIndex((p) => p.id === profileId);
      const profile: RtkProfile = {
        id: profileId,
        name,
        host,
        port: Number.isFinite(port) ? port : 2101,
        mountpoint,
        username,
        password,
        createdAt: existingIdx >= 0 ? profiles[existingIdx].createdAt : now,
        updatedAt: now,
      };
      if (existingIdx >= 0) profiles[existingIdx] = profile;
      else profiles.push(profile);
      await writeRtkProfiles(profiles);
      res.json({ success: true, profile });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to save RTK profile" });
    }
  });

  app.post("/api/mavlink/rtk/profiles/import", async (req, res) => {
    try {
      const incoming = Array.isArray(req.body?.profiles) ? req.body.profiles : [];
      if (!incoming.length) return res.status(400).json({ success: false, error: "profiles array is required" });

      const current = await readRtkProfiles();
      const byId = new Map<string, RtkProfile>(current.map((p) => [p.id, p]));
      const now = new Date().toISOString();
      let imported = 0;
      let skipped = 0;

      for (const raw of incoming) {
        const id = String(raw?.id || `rtk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).trim();
        const name = String(raw?.name || "").trim();
        const host = String(raw?.host || "").trim();
        const mountpoint = String(raw?.mountpoint || "").trim();
        if (!name || !host || !mountpoint) {
          skipped += 1;
          continue;
        }
        const existing = byId.get(id);
        byId.set(id, {
          id,
          name,
          host,
          port: Number(raw?.port || 2101),
          mountpoint,
          username: String(raw?.username || "").trim(),
          password: String(raw?.password || "").trim(),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
        imported += 1;
      }

      await writeRtkProfiles(Array.from(byId.values()));
      res.json({ success: true, imported, skipped, total: byId.size });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to import RTK profiles" });
    }
  });

  app.delete("/api/mavlink/rtk/profiles/:id", async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const profiles = await readRtkProfiles();
      const next = profiles.filter((p) => p.id !== id);
      await writeRtkProfiles(next);
      res.json({ success: true, removed: profiles.length - next.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to delete RTK profile" });
    }
  });

  app.get("/api/mavlink/rtk/status", async (_req, res) => {
    res.json({ success: true, state: rtkNtripState });
  });

  app.post("/api/mavlink/rtk/start", async (req, res) => {
    try {
      const host = String(req.body?.host || "").trim();
      const port = Number(req.body?.port || 2101);
      const mountpoint = String(req.body?.mountpoint || "").trim();
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "").trim();
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!host || !mountpoint || !connectionString) {
        return res.status(400).json({ success: false, error: "host, mountpoint, and connectionString are required" });
      }
      const started = startRtkNtripProcess(host, port, mountpoint, username, password, connectionString);
      if (!started.ok) return res.status(409).json({ success: false, error: started.error });
      res.json({ success: true, state: rtkNtripState });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to start RTK/NTRIP" });
    }
  });

  app.post("/api/mavlink/rtk/reconnect", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const profileId = String(req.body?.profileId || "").trim();
      if (!connectionString || !profileId) {
        return res.status(400).json({ success: false, error: "connectionString and profileId are required" });
      }

      const profiles = await readRtkProfiles();
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) return res.status(404).json({ success: false, error: "RTK profile not found" });

      if (rtkNtripProcess) {
        rtkNtripProcess.kill("SIGTERM");
        rtkNtripProcess = null;
      }
      rtkNtripState.running = false;
      rtkNtripState.message = "Reconnecting";

      const started = startRtkNtripProcess(
        profile.host,
        profile.port,
        profile.mountpoint,
        profile.username,
        profile.password,
        connectionString,
      );
      if (!started.ok) return res.status(409).json({ success: false, error: started.error });
      res.json({ success: true, state: rtkNtripState, profile });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to reconnect RTK/NTRIP" });
    }
  });

  app.get("/api/mavlink/gps-inject/status", async (_req, res) => {
    res.json({ success: true, state: gpsInjectState });
  });

  app.post("/api/mavlink/gps-inject/start", async (req, res) => {
    try {
      if (gpsInjectProcess) return res.status(409).json({ success: false, error: "GPS inject already running" });
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      let host = String(req.body?.host || "").trim();
      let port = Number(req.body?.port || 2101);
      let mountpoint = String(req.body?.mountpoint || "").trim();
      let username = String(req.body?.username || "").trim();
      let password = String(req.body?.password || "").trim();
      const profileId = String(req.body?.profileId || "").trim();
      if (profileId) {
        const profiles = await readRtkProfiles();
        const p = profiles.find((x) => x.id === profileId);
        if (!p) return res.status(404).json({ success: false, error: "RTK profile not found" });
        host = p.host;
        port = p.port;
        mountpoint = p.mountpoint;
        username = p.username;
        password = p.password;
      }
      if (!host || !mountpoint) {
        return res.status(400).json({ success: false, error: "host and mountpoint (or profileId) are required" });
      }

      const template = process.env.MOUSE_GPS_INJECT_CMD || "";
      if (!template.trim()) {
        return res.status(503).json({
          success: false,
          error: "MOUSE_GPS_INJECT_CMD is not configured",
          example: "str2str -in ntrip://{user}:{pass}@{host}:{port}/{mount} -out serial://{conn}",
        });
      }

      const cmd = template
        .replace(/\{host\}/g, host)
        .replace(/\{port\}/g, String(port))
        .replace(/\{mount\}/g, mountpoint)
        .replace(/\{user\}/g, username)
        .replace(/\{pass\}/g, password)
        .replace(/\{conn\}/g, connectionString);
      const child = spawn("/bin/zsh", ["-lc", cmd], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "ignore",
      });
      gpsInjectProcess = child;
      gpsInjectState.running = true;
      gpsInjectState.command = cmd;
      gpsInjectState.startedAt = new Date().toISOString();
      gpsInjectState.profileId = profileId;
      gpsInjectState.message = "GPS injection active";

      child.on("exit", () => {
        gpsInjectProcess = null;
        gpsInjectState.running = false;
        gpsInjectState.message = "Stopped";
      });

      res.json({ success: true, state: gpsInjectState });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to start GPS inject" });
    }
  });

  app.post("/api/mavlink/gps-inject/stop", async (_req, res) => {
    try {
      if (gpsInjectProcess) {
        gpsInjectProcess.kill("SIGTERM");
        gpsInjectProcess = null;
      }
      gpsInjectState.running = false;
      gpsInjectState.message = "Stopped";
      res.json({ success: true, state: gpsInjectState });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to stop GPS inject" });
    }
  });

  app.get("/api/firmware/catalog", async (_req, res) => {
    try {
      const entries = await readFirmwareCatalog();
      res.json({ success: true, entries });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to load firmware catalog" });
    }
  });

  app.post("/api/firmware/catalog", async (req, res) => {
    try {
      const entry = req.body || {};
      const id = String(entry.id || `fw-${Date.now()}`).trim();
      const name = String(entry.name || "").trim();
      const version = String(entry.version || "").trim();
      const fileUrl = String(entry.fileUrl || "").trim();
      const vehicle = String(entry.vehicle || "copter").trim();
      if (!name || !version || !fileUrl) {
        return res.status(400).json({ success: false, error: "name, version, fileUrl are required" });
      }
      const entries = await readFirmwareCatalog();
      const idx = entries.findIndex((e: any) => String(e.id) === id);
      const row = { id, name, version, vehicle, fileUrl, notes: String(entry.notes || ""), updatedAt: new Date().toISOString() };
      if (idx >= 0) entries[idx] = row;
      else entries.push(row);
      await writeFirmwareCatalog(entries);
      res.json({ success: true, entry: row });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to update firmware catalog" });
    }
  });

  app.delete("/api/firmware/catalog/:id", async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const entries = await readFirmwareCatalog();
      const next = entries.filter((e: any) => String(e.id) !== id);
      await writeFirmwareCatalog(next);
      res.json({ success: true, removed: entries.length - next.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to delete firmware catalog entry" });
    }
  });

  app.post("/api/firmware/catalog/install", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const id = String(req.body?.id || "").trim();
      if (!connectionString || !id) {
        return res.status(400).json({ success: false, error: "connectionString and id are required" });
      }
      const entries = await readFirmwareCatalog();
      const entry = entries.find((e: any) => String(e.id) === id);
      if (!entry) return res.status(404).json({ success: false, error: "catalog entry not found" });
      const url = String(entry.fileUrl || "");
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return res.status(400).json({ success: false, error: "fileUrl must be http/https" });
      }

      const resp = await fetch(url);
      if (!resp.ok) return res.status(502).json({ success: false, error: `Failed to download firmware (${resp.status})` });
      const buf = Buffer.from(await resp.arrayBuffer());
      const filename = `${String(entry.name).replace(/\s+/g, "_")}-${String(entry.version)}.apj`;
      const asBase64 = buf.toString("base64");

      // Reuse existing flashing endpoint workflow.
      req.body.filename = filename;
      req.body.fileContentBase64 = asBase64;
      req.body.connectionString = connectionString;
      // Call through same logic by invoking client endpoint style (internal function duplication avoided).
      return res.json({ success: true, downloaded: true, filename, fileContentBase64: asBase64, note: "Use /api/firmware/flash with this payload" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to install firmware from catalog" });
    }
  });

  app.post("/api/mavlink/rtk/stop", async (_req, res) => {
    try {
      if (rtkNtripProcess) {
        rtkNtripProcess.kill("SIGTERM");
        rtkNtripProcess = null;
      }
      rtkNtripState.running = false;
      rtkNtripState.message = "Stopped";
      res.json({ success: true, state: rtkNtripState });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to stop RTK/NTRIP" });
    }
  });

  app.get("/api/firmware/status", async (_req, res) => {
    res.json({ success: true, state: firmwareState });
  });

  app.post("/api/firmware/flash", async (req, res) => {
    try {
      if (firmwareState.busy) return res.status(409).json({ success: false, error: "Firmware operation already running" });
      const connectionString = String(req.body?.connectionString || "").trim();
      const filename = String(req.body?.filename || "").trim();
      const base64 = String(req.body?.fileContentBase64 || "");
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!filename || !base64) return res.status(400).json({ success: false, error: "filename and fileContentBase64 are required" });
      if (!filename.endsWith(".apj") && !filename.endsWith(".px4")) {
        return res.status(400).json({ success: false, error: "Firmware must be .apj or .px4" });
      }

      const firmwareDir = path.resolve(process.cwd(), "data", "firmware");
      mkdirSync(firmwareDir, { recursive: true });
      const safeName = `${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const fullPath = path.join(firmwareDir, safeName);
      await writeFile(fullPath, Buffer.from(base64, "base64"));

      firmwareState.busy = true;
      firmwareState.progress = 5;
      firmwareState.status = "running";
      firmwareState.message = "Firmware upload started";
      firmwareState.lastRunAt = new Date().toISOString();

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_firmware.py"),
        "flash",
        "--connection",
        connectionString,
        "--file",
        fullPath,
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      const progressTimer = setInterval(() => {
        if (firmwareState.progress < 90 && firmwareState.busy) firmwareState.progress += 5;
      }, 500);

      py.on("close", () => {
        clearInterval(progressTimer);
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) {
            firmwareState.busy = false;
            firmwareState.progress = 100;
            firmwareState.status = "completed";
            firmwareState.message = parsed?.message || "Firmware uploaded";
            return;
          }
          firmwareState.busy = false;
          firmwareState.status = "failed";
          firmwareState.message = parsed?.error || err || "Firmware upload failed";
          firmwareState.progress = 0;
        } catch {
          firmwareState.busy = false;
          firmwareState.status = "failed";
          firmwareState.message = err || "Firmware upload failed";
          firmwareState.progress = 0;
        }
      });

      res.json({ success: true, started: true });
    } catch (error: any) {
      firmwareState.busy = false;
      firmwareState.status = "failed";
      firmwareState.message = error?.message || "Firmware upload failed";
      firmwareState.progress = 0;
      res.status(500).json({ success: false, error: firmwareState.message });
    }
  });

  app.post("/api/firmware/recover-bootloader", async (req, res) => {
    try {
      if (firmwareState.busy) return res.status(409).json({ success: false, error: "Firmware operation already running" });
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      firmwareState.busy = true;
      firmwareState.progress = 10;
      firmwareState.status = "running";
      firmwareState.message = "Bootloader recovery started";
      firmwareState.lastRunAt = new Date().toISOString();

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_firmware.py"),
        "recover",
        "--connection",
        connectionString,
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) {
            firmwareState.busy = false;
            firmwareState.progress = 100;
            firmwareState.status = "completed";
            firmwareState.message = parsed?.message || "Bootloader recovery completed";
            return;
          }
          firmwareState.busy = false;
          firmwareState.progress = 0;
          firmwareState.status = "failed";
          firmwareState.message = parsed?.error || err || "Bootloader recovery failed";
        } catch {
          firmwareState.busy = false;
          firmwareState.progress = 0;
          firmwareState.status = "failed";
          firmwareState.message = err || "Bootloader recovery failed";
        }
      });
      res.json({ success: true, started: true });
    } catch (error: any) {
      firmwareState.busy = false;
      firmwareState.progress = 0;
      firmwareState.status = "failed";
      firmwareState.message = error?.message || "Bootloader recovery failed";
      res.status(500).json({ success: false, error: firmwareState.message });
    }
  });

  app.get("/api/mavlink/dataflash/list", async (req, res) => {
    try {
      const connectionString = String(req.query.connectionString || "").trim();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      const py = spawn(PYTHON_EXEC, [path.join(SCRIPTS_DIR, "mavlink_dataflash.py"), "list", "--connection", connectionString, "--timeout", "10"]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "Failed to list DataFlash logs" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid DataFlash list response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to list DataFlash logs" });
    }
  });

  app.post("/api/mavlink/dataflash/download", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const logId = Number(req.body?.logId);
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!Number.isFinite(logId)) return res.status(400).json({ success: false, error: "logId is required" });
      const logsDir = path.resolve(process.cwd(), "data", "dataflash");
      mkdirSync(logsDir, { recursive: true });
      const outPath = path.join(logsDir, `log-${logId}-${Date.now()}.bin`);
      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_dataflash.py"),
        "download",
        "--connection",
        connectionString,
        "--log-id",
        String(logId),
        "--output",
        outPath,
        "--timeout",
        "12",
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) return res.status(500).json({ success: false, error: parsed?.error || err || "DataFlash download failed" });
          const name = path.basename(parsed.output || outPath);
          return res.json({ success: true, logId, size: parsed.size, file: name, filePath: outPath, downloadUrl: `/api/mavlink/dataflash/file/${name}` });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid DataFlash download response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "DataFlash download failed" });
    }
  });

  app.get("/api/mavlink/dataflash/file/:name", async (req, res) => {
    try {
      const safeName = path.basename(String(req.params.name || ""));
      const filePath = path.resolve(process.cwd(), "data", "dataflash", safeName);
      if (!existsSync(filePath)) return res.status(404).json({ success: false, error: "File not found" });
      res.download(filePath);
    } catch {
      res.status(500).json({ success: false, error: "Failed to download file" });
    }
  });

  app.post("/api/mavlink/dataflash/analyze", async (req, res) => {
    try {
      const filePath = String(req.body?.filePath || "").trim();
      if (!filePath) return res.status(400).json({ success: false, error: "filePath is required" });
      const py = spawn(PYTHON_EXEC, [path.join(SCRIPTS_DIR, "mavlink_dataflash.py"), "analyze", "--file", filePath]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (parsed?.success) return res.json(parsed);
          return res.status(500).json({ success: false, error: parsed?.error || err || "DataFlash analysis failed" });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid DataFlash analysis response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "DataFlash analysis failed" });
    }
  });

  app.post("/api/mavlink/dataflash/replay", async (req, res) => {
    try {
      const filePath = String(req.body?.filePath || "").trim();
      if (!filePath) return res.status(400).json({ success: false, error: "filePath is required" });
      const py = spawn(PYTHON_EXEC, [path.join(SCRIPTS_DIR, "mavlink_dataflash.py"), "analyze", "--file", filePath]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) return res.status(500).json({ success: false, error: parsed?.error || err || "Replay parse failed" });
          const analysis = parsed.analysis || {};
          const gpsTrack = Array.isArray(analysis.gpsTrack) ? analysis.gpsTrack : [];
          const keyframes = gpsTrack
            .map((p: any, i: number) => ({
              i: i + 1,
              lat: Number(p.lat),
              lng: Number(p.lng),
              alt: Number.isFinite(Number(p.alt)) ? Number(p.alt) : null,
              t: Number.isFinite(Number(p.t)) ? Number(p.t) : null,
            }))
            .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
          const geojson = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: keyframes.map((k: any) => [k.lng, k.lat, Number.isFinite(k.alt) ? k.alt : 0]),
                },
                properties: {
                  file: analysis.file,
                  pointCount: keyframes.length,
                  durationSecApprox: analysis.durationSecApprox ?? null,
                },
              },
            ],
          };
          return res.json({ success: true, replay: { keyframes, geojson, summary: { file: analysis.file, pointCount: keyframes.length, durationSecApprox: analysis.durationSecApprox ?? null } } });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid replay response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "DataFlash replay failed" });
    }
  });

  app.post("/api/mavlink/geotag/run", async (req, res) => {
    try {
      const imagesDir = String(req.body?.imagesDir || "").trim();
      const logFile = String(req.body?.logFile || "").trim();
      const writeExif = Boolean(req.body?.writeExif);
      const matchModeRaw = String(req.body?.matchMode || "proportional").trim().toLowerCase();
      const matchMode = matchModeRaw === "time_offset" ? "time_offset" : "proportional";
      const timeOffsetSec = Number(req.body?.timeOffsetSec || 0);
      if (!imagesDir || !logFile) {
        return res.status(400).json({ success: false, error: "imagesDir and logFile are required" });
      }
      const outDir = path.resolve(process.cwd(), "data", "geotag");
      mkdirSync(outDir, { recursive: true });
      const outJson = path.join(outDir, `geotag-${Date.now()}.json`);

      const py = spawn(PYTHON_EXEC, [
        path.join(SCRIPTS_DIR, "mavlink_geotag.py"),
        "--images-dir",
        imagesDir,
        "--log-file",
        logFile,
        "--out-json",
        outJson,
        "--match-mode",
        matchMode,
        "--time-offset-sec",
        String(Number.isFinite(timeOffsetSec) ? timeOffsetSec : 0),
        ...(writeExif ? ["--write-exif"] : []),
      ]);
      let out = "";
      let err = "";
      py.stdout.on("data", (d: Buffer) => (out += d.toString()));
      py.stderr.on("data", (d: Buffer) => (err += d.toString()));
      py.on("close", () => {
        try {
          const parsed = JSON.parse((out || "").trim() || "{}");
          if (!parsed?.success) {
            return res.status(500).json({ success: false, error: parsed?.error || err || "Geotagging failed" });
          }
          return res.json({ success: true, report: parsed, reportPath: outJson });
        } catch {
          return res.status(500).json({ success: false, error: err || "Invalid geotag response" });
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Geotagging failed" });
    }
  });

  app.get("/api/plugins", async (_req, res) => {
    try {
      mkdirSync(PLUGINS_DIR, { recursive: true });
      const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
      const state = await readPluginState();
      const plugins: any[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = entry.name;
        const manifestPath = path.join(PLUGINS_DIR, id, "plugin.json");
        if (!existsSync(manifestPath)) continue;
        try {
          const raw = await readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(raw);
          plugins.push({
            id,
            name: String(manifest?.name || id),
            version: String(manifest?.version || "0.0.0"),
            description: String(manifest?.description || ""),
            tools: Array.isArray(manifest?.tools) ? manifest.tools : [],
            enabled: state[id]?.enabled !== false,
          });
        } catch {
          plugins.push({ id, name: id, version: "0.0.0", description: "Invalid plugin manifest", tools: [], enabled: false });
        }
      }
      res.json({ success: true, plugins });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to load plugins" });
    }
  });

  app.post("/api/plugins/:id/enable", async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const enabled = req.body?.enabled !== false;
      const state = await readPluginState();
      state[id] = { enabled };
      await writePluginState(state);
      res.json({ success: true, id, enabled });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to update plugin state" });
    }
  });

  app.post("/api/plugins/:id/run-tool", async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      const toolId = String(req.body?.toolId || "").trim();
      const argsRaw = String(req.body?.args || "").trim();
      const state = await readPluginState();
      if (state[id] && state[id].enabled === false) {
        return res.status(403).json({ success: false, error: "Plugin is disabled" });
      }

      const manifestPath = path.join(PLUGINS_DIR, id, "plugin.json");
      if (!existsSync(manifestPath)) return res.status(404).json({ success: false, error: "Plugin not found" });
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
      const tool = tools.find((t: any) => String(t?.id || "") === toolId);
      if (!tool || !String(tool.command || "").trim()) {
        return res.status(404).json({ success: false, error: "Tool not found in plugin manifest" });
      }

      // Command comes from local plugin manifest; args are appended as plain text.
      const cmd = `${String(tool.command).trim()}${argsRaw ? ` ${argsRaw}` : ""}`;
      const proc = spawn("/bin/zsh", ["-lc", cmd], { cwd: process.cwd(), env: process.env });
      let out = "";
      let err = "";
      proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
      proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
      proc.on("close", (code) => {
        res.json({
          success: code === 0,
          pluginId: id,
          toolId,
          code,
          stdout: out.slice(0, 12000),
          stderr: err.slice(0, 12000),
        });
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to run plugin tool" });
    }
  });

  app.post("/api/plugins/sdk/create-template", async (req, res) => {
    try {
      const id = String(req.body?.id || "").trim().toLowerCase();
      const name = String(req.body?.name || "").trim();
      if (!id || !/^[a-z0-9_-]+$/.test(id)) {
        return res.status(400).json({ success: false, error: "id is required (a-z0-9_-)" });
      }
      const pluginDir = path.join(PLUGINS_DIR, id);
      const toolsDir = path.join(pluginDir, "tools");
      if (existsSync(pluginDir)) return res.status(409).json({ success: false, error: "plugin id already exists" });
      mkdirSync(toolsDir, { recursive: true });
      const manifest = {
        name: name || id,
        version: "0.1.0",
        description: "Starter plugin scaffold",
        tools: [
          {
            id: "hello",
            name: "Hello Tool",
            command: `bash plugins/${id}/tools/hello.sh`,
          },
        ],
      };
      await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf-8");
      await writeFile(
        path.join(pluginDir, "README.md"),
        `# ${name || id}\n\nStarter plugin scaffold.\n\n- Edit \`plugin.json\` to define tools.\n- Add scripts under \`tools/\`.\n`,
        "utf-8",
      );
      await writeFile(
        path.join(toolsDir, "hello.sh"),
        "#!/bin/bash\nset -euo pipefail\necho \"Hello from plugin template\"\n",
        "utf-8",
      );
      try {
        const proc = spawn("/bin/zsh", ["-lc", `chmod +x ${path.join(toolsDir, "hello.sh")}`], { cwd: process.cwd(), env: process.env });
        proc.on("close", () => {});
      } catch {
        // best effort
      }
      res.json({ success: true, id, pluginDir });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to create plugin template" });
    }
  });

  app.post("/api/plugins/sdk/validate", async (req, res) => {
    try {
      const id = String(req.body?.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "id is required" });
      const pluginDir = path.join(PLUGINS_DIR, id);
      const manifestPath = path.join(pluginDir, "plugin.json");
      if (!existsSync(manifestPath)) return res.status(404).json({ success: false, error: "plugin manifest not found" });
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!String(manifest?.name || "").trim()) errors.push("name is required");
      if (!String(manifest?.version || "").trim()) errors.push("version is required");
      const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
      if (!tools.length) warnings.push("no tools defined");
      for (const tool of tools) {
        const tid = String(tool?.id || "").trim();
        const cmd = String(tool?.command || "").trim();
        if (!tid) errors.push("tool id missing");
        if (!cmd) errors.push(`tool ${tid || "<unknown>"} missing command`);
      }
      res.json({ success: errors.length === 0, id, errors, warnings, toolCount: tools.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Plugin validation failed" });
    }
  });

  app.post("/api/plugins/sdk/package", async (req, res) => {
    try {
      const id = String(req.body?.id || "").trim();
      if (!id) return res.status(400).json({ success: false, error: "id is required" });
      const pluginDir = path.join(PLUGINS_DIR, id);
      if (!existsSync(pluginDir)) return res.status(404).json({ success: false, error: "plugin not found" });
      const outDir = path.resolve(process.cwd(), "data", "plugins");
      mkdirSync(outDir, { recursive: true });
      const archivePath = path.join(outDir, `${id}-${Date.now()}.tar.gz`);
      const proc = spawn("/bin/zsh", ["-lc", `tar -czf "${archivePath}" -C "${PLUGINS_DIR}" "${id}"`], {
        cwd: process.cwd(),
        env: process.env,
      });
      let err = "";
      proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
      proc.on("close", (code) => {
        if (code !== 0 || !existsSync(archivePath)) {
          return res.status(500).json({ success: false, error: err || "Failed to package plugin" });
        }
        return res.json({ success: true, id, archivePath });
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Plugin packaging failed" });
    }
  });

  // Runtime config API - returns device role for Pi vs Ground Control detection
  app.get("/api/runtime-config", async (req, res) => {
    const deviceRole = process.env.DEVICE_ROLE || "GROUND";
    const mavlinkDefaults = deviceRole === "ONBOARD" ? {
      connectionString: "/dev/ttyACM0",
      baudRate: 115200,
    } : null;
    
    res.json({
      deviceRole,
      mavlinkDefaults,
      isOnboard: deviceRole === "ONBOARD",
    });
  });

  // Connection test API for Settings panel (cross-platform and Pi-aware)
  app.post("/api/connections/test", async (req, res) => {
    const device = String(req.body?.device || "");
    const settings = req.body?.settings || {};
    const isRaspberryPi =
      process.env.DEVICE_ROLE === "ONBOARD" || existsSync("/sys/firmware/devicetree/base/model");

    const ok = (details: Record<string, unknown> = {}) =>
      res.json({ success: true, simulated: !isRaspberryPi, ...details });
    const fail = (message: string, details: Record<string, unknown> = {}) =>
      res.status(200).json({ success: false, error: message, simulated: !isRaspberryPi, ...details });

    try {
      if (device === "fc") {
        const connectionType = String(settings.connectionType || "usb");
        const port = String(settings.fcPort || "");

        if (connectionType === "usb" || connectionType === "gpio") {
          if (os.platform() === "win32") {
            if (/^COM\d+$/i.test(port)) return ok({ message: `Flight controller port ${port} accepted` });
            return fail(`Invalid Windows serial port: ${port || "unset"}`);
          }

          if (!port) return fail("Flight controller serial port is not set");
          if (!existsSync(port)) return fail(`Serial port not found: ${port}`);
          return ok({ message: `Flight controller serial port detected: ${port}` });
        }

        if (connectionType === "can") {
          const canId = String(settings.canBusId || "1");
          return ok({ message: `CAN bus configuration accepted (Bus ${canId})` });
        }

        return ok({ message: "Flight controller connection settings accepted" });
      }

      if (device === "gps") {
        const gpsEnabled = settings.gpsEnabled !== false;
        if (!gpsEnabled) return fail("GPS is disabled in settings");
        return ok({ message: "GPS configuration accepted" });
      }

      if (device === "lidar") {
        const lidarEnabled = settings.lidarEnabled !== false;
        if (!lidarEnabled) return fail("LiDAR is disabled in settings");
        return ok({
          message: `LiDAR configuration accepted (${String(settings.lidarAddress || "0x62")})`,
        });
      }

      if (device === "camera") {
        const connectionType = String(settings.connectionType || "");
        const ip = String(settings.droneIp || "");
        const port = Number(settings.telemetryPort || 0);

        if (connectionType !== "wifi") {
          return ok({ message: "Camera link test skipped for non-WiFi mode" });
        }
        if (!ip || !port) {
          return fail("Drone IP or telemetry port is not configured");
        }

        const reachable = await new Promise<boolean>((resolve) => {
          const socket = net.createConnection({ host: ip, port, timeout: 1800 });
          const done = (state: boolean) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(state);
          };
          socket.once("connect", () => done(true));
          socket.once("timeout", () => done(false));
          socket.once("error", () => done(false));
        });

        if (!reachable) {
          return fail(`Could not reach ${ip}:${port}`, { host: ip, port });
        }
        return ok({ message: `Connected to ${ip}:${port}`, host: ip, port });
      }

      return fail("Unsupported test device");
    } catch (error: any) {
      return fail("Connection test failed", { details: error?.message || String(error) });
    }
  });

  // Authentication: Create server-side session on login
  // SECURITY MODEL: This GCS is designed for closed network deployment with trusted team members.
  // Users are managed client-side (localStorage). The server validates that:
  // 1. Login requests generate cryptographically secure session tokens (256-bit entropy)
  // 2. Session tokens are required for WebSocket DM routing
  // 3. Session tokens are required for admin-only API endpoints
  // For internet-facing deployments, implement server-side credential validation.
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { userId, username, role, name } = req.body;
      const normalizedRole = ["admin", "operator", "viewer"].includes(String(role || "").toLowerCase())
        ? String(role).toLowerCase()
        : "viewer";
      
      // Generate a secure session token
      const sessionToken = generateSessionToken();
      
      // Store session on server
      activeSessions.set(sessionToken, {
        userId,
        role: normalizedRole,
        name: name || username || 'Unknown',
        createdAt: Date.now()
      });
      void appendCloudDocument("operator_actions", {
        action: "login",
        userId,
        username: username || null,
        role: normalizedRole,
        at: new Date().toISOString(),
      }, {
        session: { userId, role: normalizedRole, name: name || username || "Unknown" },
        visibility: "admin",
      }).catch(() => {});
      
      console.log(`User ${name} (${userId}) logged in with role: ${normalizedRole}`);
      
      res.json({ 
        success: true, 
        sessionToken,
        message: 'Login successful' 
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Authentication: Logout - invalidate session
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      const session = validateSession(sessionToken);
      if (sessionToken) {
        activeSessions.delete(sessionToken);
      }
      if (session) {
        void appendCloudDocument("operator_actions", {
          action: "logout",
          userId: session.userId,
          role: session.role || "viewer",
          at: new Date().toISOString(),
        }, {
          session,
          visibility: "admin",
        }).catch(() => {});
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Settings API
  app.get("/api/settings/:category", async (req, res) => {
    try {
      const settings = await storage.getSettingsByCategory(req.params.category);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validated = insertSettingsSchema.parse(req.body);
      const setting = await storage.upsertSetting(validated);
      void syncCloudDocument("settings", `${setting.category}:${setting.key}`, setting, { session: requestSession(req) }).catch(() => {});
      res.json(setting);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to save setting" });
      }
    }
  });

  // Missions API
  app.get("/api/missions", async (req, res) => {
    try {
      const missions = await storage.getAllMissions();
      res.json(missions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch missions" });
    }
  });

  app.get("/api/missions/:id", async (req, res) => {
    try {
      const mission = await storage.getMission(req.params.id);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }
      res.json(mission);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch mission" });
    }
  });

  app.post("/api/missions", async (req, res) => {
    try {
      const validated = insertMissionSchema.parse(req.body);
      const mission = await storage.createMission(validated);
      void syncCloudDocument("missions", mission.id, mission, { session: requestSession(req) }).catch(() => {});
      res.json(mission);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create mission" });
      }
    }
  });

  app.patch("/api/missions/:id", async (req, res) => {
    try {
      const mission = await storage.updateMission(req.params.id, req.body);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }
      void syncCloudDocument("missions", mission.id, mission, { session: requestSession(req) }).catch(() => {});
      res.json(mission);
    } catch (error) {
      res.status(500).json({ error: "Failed to update mission" });
    }
  });

  app.delete("/api/missions/:id", async (req, res) => {
    try {
      await storage.deleteMission(req.params.id);
      void deleteCloudDocument("missions", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete mission" });
    }
  });

  // Waypoints API
  app.get("/api/missions/:missionId/waypoints", async (req, res) => {
    try {
      const waypoints = await storage.getWaypointsByMission(req.params.missionId);
      res.json(waypoints);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch waypoints" });
    }
  });

  app.post("/api/waypoints", async (req, res) => {
    try {
      const validated = insertWaypointSchema.parse(req.body);
      const waypoint = await storage.createWaypoint(validated);
      void syncCloudDocument("waypoints", waypoint.id, waypoint, { session: requestSession(req) }).catch(() => {});
      res.json(waypoint);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create waypoint" });
      }
    }
  });

  app.patch("/api/waypoints/:id", async (req, res) => {
    try {
      const waypoint = await storage.updateWaypoint(req.params.id, req.body);
      if (!waypoint) {
        return res.status(404).json({ error: "Waypoint not found" });
      }
      void syncCloudDocument("waypoints", waypoint.id, waypoint, { session: requestSession(req) }).catch(() => {});
      res.json(waypoint);
    } catch (error) {
      res.status(500).json({ error: "Failed to update waypoint" });
    }
  });

  app.delete("/api/waypoints/:id", async (req, res) => {
    try {
      await storage.deleteWaypoint(req.params.id);
      void deleteCloudDocument("waypoints", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete waypoint" });
    }
  });

  // Flight Logs API
  app.post("/api/flight-logs", async (req, res) => {
    try {
      const validated = insertFlightLogSchema.parse(req.body);
      const log = await storage.createFlightLog(validated);
      broadcast("telemetry", log);
      void appendCloudDocument("flight_logs", log, { session: requestSession(req) }).catch(() => {});
      res.json(log);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create flight log" });
      }
    }
  });

  app.get("/api/flight-logs/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getRecentFlightLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight logs" });
    }
  });

  app.delete("/api/flight-logs/:id", async (req, res) => {
    try {
      await storage.deleteFlightLog(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight log" });
    }
  });

  // Motor Telemetry API
  app.post("/api/motor-telemetry", async (req, res) => {
    try {
      const validated = insertMotorTelemetrySchema.parse(req.body);
      const telemetry = await storage.createMotorTelemetry(validated);
      broadcast("motor_telemetry", telemetry);
      void appendCloudDocument("motor_telemetry", telemetry, { session: requestSession(req) }).catch(() => {});
      res.json(telemetry);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create motor telemetry" });
      }
    }
  });

  app.get("/api/motor-telemetry/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const telemetry = await storage.getRecentMotorTelemetry(limit);
      res.json(telemetry);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch motor telemetry" });
    }
  });

  // Sensor Data API
  app.post("/api/sensor-data", async (req, res) => {
    try {
      const validated = insertSensorDataSchema.parse(req.body);
      const data = await storage.createSensorData(validated);
      broadcast("sensor_data", data);
      void appendCloudDocument("sensor_data", data, { session: requestSession(req) }).catch(() => {});
      res.json(data);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create sensor data" });
      }
    }
  });

  app.get("/api/sensor-data/:sensorType", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await storage.getRecentSensorData(req.params.sensorType, limit);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sensor data" });
    }
  });

  // Camera Settings API
  app.get("/api/camera-settings", async (req, res) => {
    try {
      const settings = await storage.getCameraSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch camera settings" });
    }
  });

  app.patch("/api/camera-settings", async (req, res) => {
    try {
      const settings = await storage.updateCameraSettings(req.body);
      broadcast("camera_settings", settings);
      void syncCloudDocument("camera_settings", "active", settings, { session: requestSession(req) }).catch(() => {});
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update camera settings" });
    }
  });

  // Geocoding API (proxy for Nominatim with proper headers)
  app.get("/api/airspace/restricted", async (req, res) => {
    try {
      const apiKey = process.env.OPENAIP_API_KEY;
      const apiBase = (process.env.OPENAIP_BASE_URL || "https://api.core.openaip.net/api").replace(/\/+$/, "");

      if (!apiKey) {
        return res.status(503).json({
          provider: "openaip",
          configured: false,
          zones: [],
          message: "OPENAIP_API_KEY is not configured",
        });
      }

      const bboxRaw = String(req.query.bbox || "").trim();
      const lat = safeNumber(req.query.lat);
      const lng = safeNumber(req.query.lng);
      const radiusMeters = Math.max(1000, Math.min(200000, safeNumber(req.query.radiusMeters) ?? 30000));

      let bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null = parseBboxParam(bboxRaw);
      if (!bbox && lat != null && lng != null) {
        bbox = buildBoundingBoxFromCenter(lat, lng, radiusMeters);
      }
      if (!bbox) {
        return res.status(400).json({
          error: "Provide either bbox=minLng,minLat,maxLng,maxLat or lat/lng query params",
        });
      }

      const cacheKey = `${bbox.minLng.toFixed(4)},${bbox.minLat.toFixed(4)},${bbox.maxLng.toFixed(4)},${bbox.maxLat.toFixed(4)}`;
      const cached = airspaceCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.payload);
      }

      const providerUrl = new URL(`${apiBase}/airspaces`);
      providerUrl.searchParams.set("bbox", `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
      providerUrl.searchParams.set("limit", "250");

      const providerResp = await fetch(providerUrl.toString(), {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MOUSE-GCS/1.0 (Ground Control Station)",
          "x-openaip-api-key": apiKey,
          "apiKey": apiKey,
        },
      });

      if (!providerResp.ok) {
        const body = await providerResp.text();
        return res.status(providerResp.status).json({
          error: "Failed to fetch restricted airspace",
          provider: "openaip",
          status: providerResp.status,
          details: body.slice(0, 300),
        });
      }

      const raw = await providerResp.json();
      const zones = normalizeRestrictedZonesFromProvider(raw);

      const payload = {
        provider: "openaip",
        configured: true,
        bbox,
        zones,
        fetchedAt: new Date().toISOString(),
      };
      airspaceCache.set(cacheKey, { payload, expiresAt: Date.now() + 2 * 60 * 1000 });

      res.json(payload);
    } catch (error) {
      console.error("Restricted airspace fetch error:", error);
      res.status(500).json({ error: "Failed to fetch restricted airspace" });
    }
  });

  app.get("/api/airspace/static-restricted", async (req, res) => {
    try {
      const bbox = parseBboxParam(String(req.query.bbox || ""));
      if (!bbox) {
        return res.status(400).json({ error: "bbox=minLng,minLat,maxLng,maxLat is required" });
      }

      const files: Array<{ key: string; file: string; label: string }> = [
        {
          key: "national",
          file: "National_Security_UAS_Flight_Restrictions.geojson",
          label: "National Security Restriction",
        },
        {
          key: "pending",
          file: "Pending_National_Security_UAS_Flight_Restrictions.geojson",
          label: "Pending Security Restriction",
        },
      ];

      const zones: AirspaceZone[] = [];
      for (const entry of files) {
        let cached = staticAirspaceCache.get(entry.key);
        if (!cached) {
          const fullPath = path.resolve(process.cwd(), "client", "public", "airspace", entry.file);
          const raw = JSON.parse(await readFile(fullPath, "utf-8"));
          cached = normalizeStaticGeoJsonToZones(raw, entry.label);
          staticAirspaceCache.set(entry.key, cached);
        }
        for (const zone of cached as AirspaceZone[]) {
          if (!zone.points || zone.points.length < 3) continue;
          const zb = zoneBbox(zone.points);
          if (bboxesOverlap(zb, bbox)) zones.push(zone);
        }
      }

      res.json({
        provider: "faa_static",
        configured: true,
        bbox,
        zones,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Static restricted airspace fetch error:", error);
      res.status(500).json({ error: "Failed to fetch static restricted airspace" });
    }
  });

  app.get("/api/airspace/tfr", async (req, res) => {
    try {
      const lat = safeNumber(req.query.lat);
      const lng = safeNumber(req.query.lng);
      const radiusMiles = Math.max(5, Math.min(200, safeNumber(req.query.radiusMiles) ?? 50));

      const tfrCacheKey = `tfr_${lat?.toFixed(2)}_${lng?.toFixed(2)}_${radiusMiles}`;
      const cached = airspaceCache.get(tfrCacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.payload);
      }

      let zones: AirspaceZone[] = [];
      try {
        const listResp = await fetch("https://tfr.faa.gov/tfr2/list.json", {
          headers: { "User-Agent": "MOUSE-GCS/1.0", "Accept": "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (listResp.ok) {
          const tfrList = await listResp.json();
          if (Array.isArray(tfrList)) {
            for (const tfr of tfrList.slice(0, 100)) {
              const tfrLat = safeNumber(tfr?.lat || tfr?.latitude);
              const tfrLng = safeNumber(tfr?.lng || tfr?.longitude || tfr?.lon);
              if (tfrLat != null && tfrLng != null) {
                if (lat != null && lng != null) {
                  const d = Math.sqrt((tfrLat - lat) ** 2 + (tfrLng - lng) ** 2) * 69;
                  if (d > radiusMiles) continue;
                }
                zones.push({
                  id: tfr.notamNumber || tfr.id || `tfr-${zones.length}`,
                  name: tfr.notamNumber || tfr.type || "TFR",
                  type: "circle",
                  center: { lat: tfrLat, lng: tfrLng },
                  radius: (safeNumber(tfr.radius) ?? 3) * 1852,
                  altMin: safeNumber(tfr.minAlt) ?? 0,
                  altMax: safeNumber(tfr.maxAlt) ?? 18000,
                  points: generateCirclePoints(tfrLat, tfrLng, safeNumber(tfr.radius) ?? 3),
                  active: true,
                  source: "faa_tfr",
                  description: tfr.description || tfr.text || "",
                  effectiveDate: tfr.effectiveDate || tfr.startDate || null,
                  expirationDate: tfr.expirationDate || tfr.endDate || null,
                });
              }
            }
          }
        }
      } catch (tfrErr: any) {
        console.warn("FAA TFR fetch failed (non-critical):", tfrErr?.message);
      }

      const payload = {
        provider: "faa_tfr",
        configured: true,
        zones,
        count: zones.length,
        radiusMiles,
        source: "https://tfr.faa.gov",
        note: "Free FAA Temporary Flight Restrictions feed - no API key required",
        fetchedAt: new Date().toISOString(),
      };
      airspaceCache.set(tfrCacheKey, { payload, expiresAt: Date.now() + 5 * 60 * 1000 });
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch TFR data", details: error?.message });
    }
  });

  app.get("/api/airspace/sources", (_req, res) => {
    const openaipConfigured = Boolean(process.env.OPENAIP_API_KEY);
    res.json({
      sources: [
        {
          id: "faa_static",
          name: "FAA UAS Restrictions (Static GeoJSON)",
          type: "static",
          configured: true,
          requiresApiKey: false,
          description: "National Security, Part-Time, and Pending UAS Flight Restrictions from FAA. Pre-loaded GeoJSON data.",
          files: [
            "National_Security_UAS_Flight_Restrictions.geojson",
            "Part_Time_National_Security_UAS_Flight_Restrictions.geojson",
            "Pending_National_Security_UAS_Flight_Restrictions.geojson",
          ],
        },
        {
          id: "faa_facility_map",
          name: "FAA UAS Facility Map",
          type: "static",
          configured: true,
          requiresApiKey: false,
          description: "FAA UAS Facility Map showing LAANC grid altitudes near controlled airspace. Large dataset (~480MB).",
        },
        {
          id: "faa_tfr",
          name: "FAA Temporary Flight Restrictions (TFR)",
          type: "live",
          configured: true,
          requiresApiKey: false,
          description: "Live TFR feed from tfr.faa.gov. Updated every 5 minutes. Free, no API key needed.",
          endpoint: "/api/airspace/tfr",
        },
        {
          id: "openaip",
          name: "OpenAIP Airspace Data",
          type: "live",
          configured: openaipConfigured,
          requiresApiKey: true,
          description: "International airspace data including restricted zones, CTR, TMA, etc. Requires free API key from openaip.net.",
          signupUrl: "https://www.openaip.net/users/sign_up",
          envVar: "OPENAIP_API_KEY",
        },
      ],
    });
  });

  app.post("/api/airspace/authorization/validate", async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ authorized: false, error: "Authorization code is required" });

    const configuredCodes = String(process.env.AIRSPACE_AUTH_CODES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (configuredCodes.length === 0) {
      return res.status(503).json({
        authorized: false,
        configured: false,
        error: "AIRSPACE_AUTH_CODES is not configured",
      });
    }

    const authorized = configuredCodes.includes(code);
    if (!authorized) {
      return res.status(403).json({ authorized: false, configured: true, error: "Invalid authorization code" });
    }

    return res.json({
      authorized: true,
      configured: true,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  });

  // Geocoding API (proxy for Nominatim with proper headers)
  app.get("/api/geocode", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'User-Agent': 'MOUSE-GCS/1.0 (Ground Control Station)',
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim returned ${response.status}`);
      }

      const results = await response.json();
      res.json(results);
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: "Failed to geocode address" });
    }
  });

  // Reverse Geocoding API
  app.get("/api/reverse-geocode", async (req, res) => {
    try {
      const lat = req.query.lat as string;
      const lon = req.query.lon as string;
      
      if (!lat || !lon) {
        return res.status(400).json({ error: "lat and lon parameters are required" });
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        {
          headers: {
            'User-Agent': 'MOUSE-GCS/1.0 (Ground Control Station)',
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim returned ${response.status}`);
      }

      const result = await response.json();
      res.json(result);
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ error: "Failed to reverse geocode" });
    }
  });

  // Google Sheets Backup API
  app.post("/api/backup/google-sheets", async (req, res) => {
    try {
      const missions = await storage.getAllMissions();
      const waypoints: any[] = [];
      for (const mission of missions) {
        const missionWaypoints = await storage.getWaypointsByMission(mission.id);
        waypoints.push(...missionWaypoints);
      }
      const flightLogs = await storage.getRecentFlightLogs(1000);
      
      const result = await syncDataToSheets({
        missions,
        waypoints,
        flightLogs,
      });

      res.json({
        success: true,
        spreadsheetUrl: getSpreadsheetUrl(result.spreadsheetId),
        syncedTables: result.syncedTables,
      });
    } catch (error: any) {
      console.error("Google Sheets backup error:", error);
      res.status(500).json({ 
        error: "Failed to backup to Google Sheets",
        message: error.message 
      });
    }
  });

  app.get("/api/backup/google-sheets/status", async (req, res) => {
    try {
      const spreadsheetId = await getOrCreateBackupSpreadsheet();
      res.json({
        connected: true,
        spreadsheetUrl: getSpreadsheetUrl(spreadsheetId),
      });
    } catch (error: any) {
      res.json({
        connected: false,
        error: error.message,
      });
    }
  });

  // GUI Config Backup API - backs up tabs, panels, widgets, and theme
  app.post("/api/backup/gui-config", async (req, res) => {
    try {
      const { tabs, panels, widgets, theme } = req.body;
      
      const result = await syncDataToSheets({
        guiConfig: { tabs, panels, widgets, theme }
      });

      res.json({
        success: true,
        spreadsheetUrl: getSpreadsheetUrl(result.spreadsheetId),
        syncedTables: result.syncedTables,
      });
    } catch (error: any) {
      console.error("GUI Config backup error:", error);
      res.status(500).json({ 
        error: "Failed to backup GUI configuration",
        message: error.message 
      });
    }
  });

  // Google Drive File Storage API
  app.get("/api/drive/status", async (req, res) => {
    try {
      const status = await checkDriveConnection();
      res.json(status);
    } catch (error: any) {
      res.json({ connected: false, error: error.message });
    }
  });

  app.get("/api/drive/files", async (req, res) => {
    try {
      const { sessionId, sessionName } = req.query;
      const result = await listDriveFiles(
        sessionId as string | undefined,
        sessionName as string | undefined
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/drive/upload", async (req, res) => {
    try {
      const { fileName, mimeType, sessionId, sessionName, data } = req.body;
      
      if (!fileName || !data) {
        return res.status(400).json({ success: false, error: "Missing fileName or data" });
      }
      const session = requestSession(req);
      const buffer = Buffer.from(data, 'base64');
      const cloudResult = await ingestMediaToCloudOrBacklog({
        fileName,
        mimeType: mimeType || "application/octet-stream",
        bytes: buffer,
        sessionId: sessionId || null,
        session,
        createAsset: false,
      });

      if (cloudResult.uploaded) {
        return res.json({
          success: true,
          provider: "firebase-storage",
          fileId: null,
          webViewLink: cloudResult.cloudPath,
          pending: false,
          storagePath: cloudResult.cloudPath,
        });
      }

      // Compatibility fallback: still attempt Google Drive if configured.
      try {
        const result = await uploadFileToDrive(
          buffer,
          fileName,
          mimeType || 'application/octet-stream',
          sessionId,
          sessionName
        );
        return res.json({
          ...result,
          provider: "google-drive",
          pending: false,
        });
      } catch {
        return res.json({
          success: true,
          provider: "local-backlog",
          pending: true,
          localPath: cloudResult.localFilePath,
          storagePath: cloudResult.localFilePath,
          webViewLink: null,
        });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/cloud/media/upload", async (req, res) => {
    try {
      const { fileName, mimeType, data, droneId, sessionId } = req.body ?? {};
      if (!fileName || !data) {
        return res.status(400).json({ success: false, error: "Missing fileName or data" });
      }
      const session = requestSession(req);
      const bytes = Buffer.from(String(data), "base64");
      const result = await ingestMediaToCloudOrBacklog({
        fileName: String(fileName),
        mimeType: String(mimeType || "application/octet-stream"),
        bytes,
        droneId: droneId ? String(droneId) : null,
        sessionId: sessionId ? String(sessionId) : null,
        session,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || String(error) });
    }
  });

  app.post("/api/cloud/media/sync-pending", async (req, res) => {
    try {
      const session = requestSession(req);
      const results = await syncPendingMediaBacklog(session);
      const synced = results.filter((r) => r.synced).length;
      res.json({ success: true, synced, attempted: results.length, results });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || String(error) });
    }
  });

  app.delete("/api/drive/files/:fileId", async (req, res) => {
    try {
      const result = await deleteFileFromDrive(req.params.fileId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Google OAuth API for standalone account management
  app.get("/api/google/status", async (req, res) => {
    try {
      const status = await checkConnectionStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/google/auth-url", (req, res) => {
    const result = getAuthUrl();
    if ('error' in result) {
      res.status(400).json({ error: result.error });
    } else {
      res.json(result);
    }
  });

  app.get("/api/google/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }
    
    const result = await handleOAuthCallback(code);
    
    if (result.success) {
      // Redirect back to settings with success message
      res.redirect('/?google_auth=success');
    } else {
      res.redirect(`/?google_auth=error&message=${encodeURIComponent(result.error || 'Unknown error')}`);
    }
  });

  app.get("/api/google/accounts", (req, res) => {
    const accounts = getAllAccounts();
    res.json(accounts);
  });

  app.post("/api/google/switch", (req, res) => {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID required' });
    }
    const success = switchAccount(accountId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Account not found' });
    }
  });

  app.delete("/api/google/accounts/:id", (req, res) => {
    const success = removeAccount(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Account not found' });
    }
  });

  app.get("/api/google/configured", (req, res) => {
    res.json({ configured: isOAuthConfigured() });
  });

  // Drones API
  app.get("/api/drones", async (req, res) => {
    try {
      const drones = await storage.getAllDrones();
      res.json(drones);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drones" });
    }
  });

  app.get("/api/drones/:id", async (req, res) => {
    try {
      const drone = await storage.getDrone(req.params.id);
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drone" });
    }
  });

  app.post("/api/drones", async (req, res) => {
    try {
      const validated = insertDroneSchema.parse(req.body);
      const drone = await storage.createDrone(validated);
      broadcast("drone_added", drone);
      void syncCloudDocument("drones", drone.id, drone, { session: requestSession(req) }).catch(() => {});
      res.json(drone);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create drone" });
      }
    }
  });

  app.patch("/api/drones/:id", async (req, res) => {
    try {
      const drone = await storage.updateDrone(req.params.id, req.body);
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      broadcast("drone_updated", drone);
      void syncCloudDocument("drones", drone.id, drone, { session: requestSession(req) }).catch(() => {});
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to update drone" });
    }
  });

  app.patch("/api/drones/:id/location", async (req, res) => {
    try {
      const { latitude, longitude, altitude, heading } = req.body;
      const drone = await storage.updateDroneLocation(
        req.params.id,
        latitude,
        longitude,
        altitude,
        heading
      );
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      broadcast("drone_location", { id: drone.id, latitude, longitude, altitude, heading });
      void syncCloudDocument("drones", drone.id, drone, { session: requestSession(req) }).catch(() => {});
      void syncCloudDocument("drone_locations", drone.id, {
        id: drone.id,
        latitude,
        longitude,
        altitude,
        heading,
        updatedAt: new Date().toISOString(),
      }, { session: requestSession(req) }).catch(() => {});
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to update drone location" });
    }
  });

  app.delete("/api/drones/:id", async (req, res) => {
    try {
      await storage.deleteDrone(req.params.id);
      broadcast("drone_removed", { id: req.params.id });
      void deleteCloudDocument("drones", req.params.id).catch(() => {});
      void deleteCloudDocument("drone_locations", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete drone" });
    }
  });

  // Media Assets API
  app.get("/api/media", async (req, res) => {
    try {
      const { droneId, sessionId, status } = req.query;
      let assets;
      
      if (droneId) {
        assets = await storage.getMediaAssetsByDrone(droneId as string);
      } else if (sessionId) {
        assets = await storage.getMediaAssetsBySession(sessionId as string);
      } else if (status === "pending") {
        assets = await storage.getPendingMediaAssets();
      } else {
        assets = await storage.getMediaAssetsByDrone("", 100);
      }
      
      res.json(assets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch media assets" });
    }
  });

  app.get("/api/media/:id", async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch media asset" });
    }
  });

  app.post("/api/media", async (req, res) => {
    try {
      const validated = insertMediaAssetSchema.parse(req.body);
      const asset = await storage.createMediaAsset(validated);
      broadcast("media_captured", asset);
      if (asset.syncStatus === "pending" && asset.storagePath) {
        await storage.createBacklogItem({
          droneId: asset.droneId || null,
          dataType: "media",
          data: {
            mediaAssetId: asset.id,
            fileName: asset.filename,
            mimeType: asset.mimeType,
          },
          priority: 2,
          localFilePath: asset.storagePath,
          fileChecksum: null,
          syncStatus: "pending",
          syncAttempts: 0,
          lastSyncAttempt: null,
          syncError: asset.syncError || "Cloud unavailable",
          recordedAt: asset.capturedAt,
        });
      }
      void syncCloudDocument("media_assets", asset.id, asset, { session: requestSession(req) }).catch(() => {});
      res.json(asset);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create media asset" });
      }
    }
  });

  app.patch("/api/media/:id", async (req, res) => {
    try {
      const asset = await storage.updateMediaAsset(req.params.id, req.body);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      void syncCloudDocument("media_assets", asset.id, asset, { session: requestSession(req) }).catch(() => {});
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to update media asset" });
    }
  });

  app.delete("/api/media/:id", async (req, res) => {
    try {
      await storage.deleteMediaAsset(req.params.id);
      void deleteCloudDocument("media_assets", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete media asset" });
    }
  });

  // Offline Backlog API - for syncing data when drone reconnects
  app.get("/api/backlog", async (req, res) => {
    try {
      const { droneId } = req.query;
      const backlog = await storage.getPendingBacklog(droneId as string | undefined);
      res.json(backlog);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch backlog" });
    }
  });

  app.post("/api/backlog", async (req, res) => {
    try {
      const validated = insertOfflineBacklogSchema.parse(req.body);
      const item = await storage.createBacklogItem(validated);
      void syncCloudDocument("offline_backlog", item.id, item, { session: requestSession(req) }).catch(() => {});
      res.json(item);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create backlog item" });
      }
    }
  });

  app.post("/api/backlog/sync", async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }
      
      const results = [];
      for (const item of items) {
        try {
          if (item.dataType === "telemetry") {
            await storage.createFlightLog(item.data);
            void appendCloudDocument("flight_logs", item.data, { session: requestSession(req) }).catch(() => {});
          } else if (item.dataType === "sensor") {
            await storage.createSensorData(item.data);
            void appendCloudDocument("sensor_data", item.data, { session: requestSession(req) }).catch(() => {});
          } else if (item.dataType === "media") {
            await storage.createMediaAsset(item.data);
            void appendCloudDocument("media_assets", item.data, { session: requestSession(req) }).catch(() => {});
          }
          
          if (item.id) {
            await storage.markBacklogSynced(item.id);
            void deleteCloudDocument("offline_backlog", item.id).catch(() => {});
          }
          results.push({ id: item.id, status: "synced" });
        } catch (err: any) {
          results.push({ id: item.id, status: "failed", error: err.message });
        }
      }
      
      broadcast("backlog_synced", { count: results.filter(r => r.status === "synced").length });
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync backlog" });
    }
  });

  app.patch("/api/backlog/:id/synced", async (req, res) => {
    try {
      await storage.markBacklogSynced(req.params.id);
      void deleteCloudDocument("offline_backlog", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark as synced" });
    }
  });

  app.delete("/api/backlog/:id", async (req, res) => {
    try {
      await storage.deleteBacklogItem(req.params.id);
      void deleteCloudDocument("offline_backlog", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete backlog item" });
    }
  });

  app.delete("/api/backlog/clear", async (req, res) => {
    try {
      const { droneId } = req.query;
      await storage.clearSyncedBacklog(droneId as string | undefined);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear synced backlog" });
    }
  });

  // User Messages API (Team Communication)
  app.get("/api/messages", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      // Server-side filtering: if userId provided, filter to only show:
      // - Broadcast messages (no recipientId)
      // - Messages sent by the user
      // - Messages where user is recipient
      const messages = userId 
        ? await storage.getMessagesForUser(userId)
        : await storage.getAllMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/chat-users", async (req, res) => {
    try {
      const users = await storage.getChatUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Admin endpoint: Get all messages with full history (including original content)
  // Security: Validates admin role from server-side session store
  app.get("/api/messages/history", async (req, res) => {
    try {
      // Validate session token from header against server session store
      const sessionToken = req.headers['x-session-token'] as string | undefined;
      const session = validateSession(sessionToken);
      let isAdmin = session?.role === 'admin';
      
      // Also allow if ADMIN_API_KEY is provided (for API access)
      const adminKey = process.env.ADMIN_API_KEY;
      const authHeader = req.headers.authorization;
      if (adminKey && authHeader === `Bearer ${adminKey}`) {
        isAdmin = true;
      }
      
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const messages = await storage.getAllMessagesWithHistory();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch message history" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { senderId, senderName, senderRole, content, recipientId, recipientName } = req.body;
      if (!senderId || !senderName || !senderRole || !content) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const message = await storage.createMessage({ 
        senderId, 
        senderName, 
        senderRole, 
        content,
        recipientId: recipientId || null,
        recipientName: recipientName || null
      });
      smartBroadcast("new_message", message);
      void syncCloudDocument("messages", message.id, message, {
        session: requestSession(req),
        visibility: message.recipientId ? "dm" : "shared",
        recipientId: message.recipientId || null,
        recipientName: message.recipientName || null,
      }).catch(() => {});
      res.json(message);
      
      // Sync messages to Google Sheets in background (non-blocking)
      setImmediate(async () => {
        try {
          const allMessages = await storage.getAllMessages();
          await storage.syncMessagesToSheets(allMessages);
        } catch (err: any) {
          console.log('Background sync to Sheets failed:', err.message);
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  app.patch("/api/messages/:id", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Content required" });
      }
      const message = await storage.updateMessage(req.params.id, content);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Use smartBroadcast for DM privacy
      smartBroadcast("message_updated", message);
      void syncCloudDocument("messages", message.id, message, {
        session: requestSession(req),
        visibility: message.recipientId ? "dm" : "shared",
        recipientId: message.recipientId || null,
        recipientName: message.recipientName || null,
      }).catch(() => {});
      res.json(message);
      
      // Sync messages to Google Sheets in background (non-blocking)
      setImmediate(async () => {
        try {
          const allMessages = await storage.getAllMessages();
          await storage.syncMessagesToSheets(allMessages);
        } catch (err: any) {
          console.log('Background sync to Sheets failed:', err.message);
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      // Get message first to know who should receive the delete notification
      const messages = await storage.getAllMessages();
      const msg = messages.find(m => m.id === req.params.id);
      
      await storage.deleteMessage(req.params.id);
      
      // Use smartBroadcast for DM privacy
      if (msg) {
        smartBroadcast("message_deleted", { id: req.params.id, senderId: msg.senderId, recipientId: msg.recipientId });
      } else {
        broadcast("message_deleted", { id: req.params.id });
      }
      void deleteCloudDocument("messages", req.params.id).catch(() => {});
      res.json({ success: true });
      
      // Sync messages to Google Sheets in background (non-blocking)
      setImmediate(async () => {
        try {
          const allMessages = await storage.getAllMessages();
          await storage.syncMessagesToSheets(allMessages);
        } catch (err: any) {
          console.log('Background sync to Sheets failed:', err.message);
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  app.post("/api/messages/sync", async (req, res) => {
    try {
      const messages = req.body;
      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array required" });
      }
      await storage.syncMessagesToSheets(messages);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync messages" });
    }
  });

  app.get("/api/cloud/config", async (_req, res) => {
    const effective = await getEffectiveCloudConfig();
    res.json({
      success: true,
      projectId: effective.projectId || "",
      databaseURL: effective.databaseURL || "",
      storageBucket: effective.storageBucket || "",
      serviceAccountPath: effective.serviceAccountPath || "",
      hasServiceAccountJson: Boolean(effective.serviceAccountJson),
      hasServiceAccountBase64: Boolean(effective.serviceAccountBase64),
      hasServiceAccountPath: Boolean(effective.serviceAccountPath),
      source: effective.source,
    });
  });

  app.post("/api/cloud/config", async (req, res) => {
    try {
      const body = req.body || {};
      const runtimeConfig = sanitizeCloudConfig({
        projectId: body.projectId,
        databaseURL: body.databaseURL,
        storageBucket: body.storageBucket,
        serviceAccountPath: body.serviceAccountPath,
        serviceAccountJson: body.serviceAccountJson,
        serviceAccountBase64: body.serviceAccountBase64,
      });
      await saveCloudRuntimeConfig(runtimeConfig);

      process.env.FIREBASE_PROJECT_ID = runtimeConfig.projectId || "";
      process.env.FIREBASE_DATABASE_URL = runtimeConfig.databaseURL || "";
      process.env.FIREBASE_STORAGE_BUCKET = runtimeConfig.storageBucket || "";
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH = runtimeConfig.serviceAccountPath || "";
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = runtimeConfig.serviceAccountJson || "";
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = runtimeConfig.serviceAccountBase64 || "";

      await resetFirebaseAdminApp();
      const probe = await runCloudHealthProbe();
      lastCloudHealthProbe = probe;
      lastCloudHealthProbeAt = probe.checkedAt;
      pushDebugEvent(probe.success ? "success" : (probe.degraded ? "warn" : "error"), "cloud.config", "Cloud configuration updated from dashboard", {
        hasProjectId: Boolean(runtimeConfig.projectId),
        hasDatabaseURL: Boolean(runtimeConfig.databaseURL),
        hasStorageBucket: Boolean(runtimeConfig.storageBucket),
        hasServiceAccountPath: Boolean(runtimeConfig.serviceAccountPath),
        hasServiceAccountJson: Boolean(runtimeConfig.serviceAccountJson),
        hasServiceAccountBase64: Boolean(runtimeConfig.serviceAccountBase64),
        probe,
      });

      res.json({
        success: true,
        probe,
      });
    } catch (error: any) {
      pushDebugEvent("error", "cloud.config", "Failed to update cloud configuration", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Failed to update cloud configuration" });
    }
  });

  app.get("/api/cloud/status", async (_req, res) => {
    const effective = await getEffectiveCloudConfig();
    res.json({
      enabled: cloudSyncEnabled(),
      projectId: effective.projectId || null,
      databaseUrl: effective.databaseURL || null,
      storageBucket: effective.storageBucket || null,
      hasServiceAccount: Boolean(
        effective.serviceAccountJson ||
        effective.serviceAccountBase64 ||
        effective.serviceAccountPath
      ),
      source: effective.source,
      lastDebugProbeAt: lastCloudHealthProbeAt,
      lastDebugProbeSuccess: lastCloudHealthProbe?.success ?? null,
    });
  });

  app.post("/api/cloud/test", async (req, res) => {
    try {
      pushDebugEvent("info", "cloud.test", "Cloud connectivity test requested");
      const probe = await runCloudHealthProbe();
      lastCloudHealthProbe = probe;
      lastCloudHealthProbeAt = probe.checkedAt;
      pushDebugEvent(probe.success ? "success" : (probe.degraded ? "warn" : "error"), "cloud.test", "Cloud connectivity test completed", probe);
      res.json({
        success: probe.success,
        firestore: probe.firestore.ok,
        realtimeDatabase: probe.realtimeDatabase.ok,
        storage: probe.storage.ok,
        projectId: process.env.FIREBASE_PROJECT_ID,
        error: probe.error,
        probe,
      });
    } catch (error: any) {
      pushDebugEvent("error", "cloud.test", "Cloud connectivity test failed", {
        error: error?.message || "Firebase connection test failed",
      });
      res.json({ success: false, error: error?.message || "Firebase connection test failed" });
    }
  });

  app.post("/api/cloud/sync-all", async (req, res) => {
    try {
      if (!cloudSyncEnabled()) {
        pushDebugEvent("warn", "cloud.sync_all", "Full cloud sync rejected: Firebase not configured");
        return res.json({ success: false, error: "Firebase is not configured" });
      }
      const session = requestSession(req);
      pushDebugEvent("info", "cloud.sync_all", "Full cloud sync requested", {
        actor: session?.name || session?.userId || "unknown",
      });
      const synced: string[] = [];
      const fs = await import("fs");
      const dataDir = process.env.DATA_DIR || "./data";

      const syncJsonFile = async (filename: string, collection: string, idField = "id") => {
        const filepath = path.join(dataDir, filename);
        if (!fs.existsSync(filepath)) return 0;
        try {
          const items = JSON.parse(fs.readFileSync(filepath, "utf-8"));
          if (!Array.isArray(items)) return 0;
          for (const item of items) {
            const docId = item[idField] || `${collection}-${items.indexOf(item)}`;
            await syncCloudDocument(collection, String(docId), item, { session });
          }
          return items.length;
        } catch { return 0; }
      };

      await syncJsonFile("settings.json", "settings", "key");
      synced.push("settings");
      await syncJsonFile("missions.json", "missions");
      synced.push("missions");
      await syncJsonFile("waypoints.json", "waypoints");
      synced.push("waypoints");
      await syncJsonFile("drones.json", "drones");
      synced.push("drones");
      await syncJsonFile("flight_logs.json", "flight_logs");
      synced.push("flight_logs");

      const syncedAt = new Date().toISOString();
      pushDebugEvent("success", "cloud.sync_all", "Full cloud sync completed", {
        synced,
        syncedAt,
      });
      res.json({ success: true, synced, syncedAt });
    } catch (error: any) {
      pushDebugEvent("error", "cloud.sync_all", "Full cloud sync failed", {
        error: error?.message || "Full sync failed",
      });
      res.json({ success: false, error: error?.message || "Full sync failed" });
    }
  });

  app.get("/api/debug/events", (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
    const source = String(req.query.source || "").trim().toLowerCase();
    const level = String(req.query.level || "").trim().toLowerCase();

    const filtered = debugEvents.filter((event) => {
      if (source && !event.source.toLowerCase().includes(source)) return false;
      if (level && event.level.toLowerCase() !== level) return false;
      return true;
    });
    const events = filtered.slice(-limit).reverse();
    res.json({
      success: true,
      total: filtered.length,
      returned: events.length,
      events,
    });
  });

  app.post("/api/debug/events/clear", (req, res) => {
    const session = requestSession(req);
    if (session && String(session.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ success: false, error: "Admin permissions required to clear debug events" });
    }
    const cleared = debugEvents.length;
    debugEvents.length = 0;
    pushDebugEvent("warn", "debug.events", "Debug event history cleared", {
      cleared,
      actor: session?.name || session?.userId || "preview",
    });
    res.json({ success: true, cleared });
  });

  app.get("/api/debug/system", async (req, res) => {
    try {
      const forceProbe = ["1", "true", "yes"].includes(String(req.query.probe || "").toLowerCase());
      const effective = await getEffectiveCloudConfig();
      if (forceProbe || !lastCloudHealthProbe) {
        const probe = await runCloudHealthProbe();
        lastCloudHealthProbe = probe;
        lastCloudHealthProbeAt = probe.checkedAt;
        pushDebugEvent(probe.success ? "success" : (probe.degraded ? "warn" : "error"), "debug.system", "System debug probe completed", probe);
      }

      const levelCounts = debugEvents.reduce<Record<string, number>>((acc, evt) => {
        acc[evt.level] = (acc[evt.level] || 0) + 1;
        return acc;
      }, {});
      const commandSources = [
        "mavlink.command",
        "mavlink.vehicle_action",
        "mavlink.swarm_action",
        "mavlink.swarm_sync_action",
      ];
      const commandEvents = debugEvents.filter((evt) => commandSources.includes(evt.source));
      const latestCommandEvent = commandEvents.length ? commandEvents[commandEvents.length - 1] : null;
      const mem = process.memoryUsage();

      res.json({
        success: true,
        now: new Date().toISOString(),
        cloud: {
          enabled: cloudSyncEnabled(),
          projectId: effective.projectId || null,
          databaseUrl: effective.databaseURL || null,
          storageBucket: effective.storageBucket || null,
          source: effective.source,
          probe: lastCloudHealthProbe,
          lastProbeAt: lastCloudHealthProbeAt,
        },
        runtime: {
          uptimeSec: Math.round(process.uptime()),
          pid: process.pid,
          nodeVersion: process.version,
          platform: `${process.platform}/${process.arch}`,
          wsClients: clients.size,
          activeUserSessions: activeSessions.size,
          memory: {
            rss: mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed: mem.heapUsed,
            external: mem.external,
          },
          services: {
            serialPassthrough: serialPassthroughState,
            rtkNtrip: rtkNtripState,
            gpsInject: gpsInjectState,
            firmware: firmwareState,
            calibration: calibrationState,
          },
          api: {
            lastError: lastApiError,
            lastSlowRequest: lastSlowApi,
          },
        },
        debug: {
          totalEvents: debugEvents.length,
          levelCounts,
          latestEvent: debugEvents.length ? debugEvents[debugEvents.length - 1] : null,
        },
        commandDispatch: {
          totalEvents: commandEvents.length,
          lastEvent: latestCommandEvent,
        },
      });
    } catch (error: any) {
      pushDebugEvent("error", "debug.system", "System debug probe failed", {
        error: error?.message || "System debug probe failed",
      });
      res.status(500).json({ success: false, error: error?.message || "System debug probe failed" });
    }
  });

  app.post("/api/debug/system/probe", async (_req, res) => {
    try {
      const probe = await runCloudHealthProbe();
      lastCloudHealthProbe = probe;
      lastCloudHealthProbeAt = probe.checkedAt;
      pushDebugEvent(probe.success ? "success" : (probe.degraded ? "warn" : "error"), "debug.system", "Manual system debug probe completed", probe);
      res.json({ success: true, probe });
    } catch (error: any) {
      pushDebugEvent("error", "debug.system", "Manual system debug probe failed", {
        error: error?.message || "System debug probe failed",
      });
      res.status(500).json({ success: false, error: error?.message || "System debug probe failed" });
    }
  });

  app.get("/api/cloud/awareness", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!session) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [drones, locations, activeSessions, telemetry, sensorData, media, missions, messages] = await Promise.all([
        getRecentCloudDocs("drones", 200),
        getRecentCloudDocs("drone_locations", 500),
        getRecentCloudDocs("flight_sessions", 200),
        getRecentCloudDocs("flight_logs", 1000),
        getRecentCloudDocs("sensor_data", 500),
        getRecentCloudDocs("media_assets", 500),
        getRecentCloudDocs("missions", 200),
        getRecentCloudDocs("messages", 400),
      ]);

      const isAdmin = session.role === "admin";
      const filteredMessages = messages.filter((m: any) => {
        const visibility = m?.__meta?.visibility || "shared";
        if (isAdmin) return true;
        if (visibility === "shared") return true;
        if (visibility === "admin") return false;
        if (visibility === "dm") {
          return m.senderId === session.userId || m.recipientId === session.userId;
        }
        return true;
      });

      res.json({
        drones,
        droneLocations: locations,
        flightSessions: activeSessions,
        telemetry,
        sensorData,
        mediaAssets: media,
        missions,
        messages: filteredMessages,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cloud awareness data" });
    }
  });

  app.get("/api/cloud/admin-dashboard", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!session || session.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const [operatorActions, messages, flightSessions, flightLogs, drones, diagnostics, mediaAssets, missions] = await Promise.all([
        getRecentCloudDocs("operator_actions", 1000),
        getRecentCloudDocs("messages", 1000),
        getRecentCloudDocs("flight_sessions", 500),
        getRecentCloudDocs("flight_logs", 2000),
        getRecentCloudDocs("drones", 500),
        getRecentCloudDocs("motor_telemetry", 1000),
        getRecentCloudDocs("media_assets", 1000),
        getRecentCloudDocs("missions", 500),
      ]);

      res.json({
        operatorActions,
        messages,
        flightSessions,
        flightLogs,
        drones,
        diagnostics,
        mediaAssets,
        missions,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch admin cloud dashboard data" });
    }
  });

  // Trigger Google sync manually
  app.post("/api/sync/google", requirePermission("system_settings"), async (req, res) => {
    try {
      await storage.syncToGoogle();
      res.json({ success: true, message: "Sync initiated" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to sync", message: error.message });
    }
  });

  // Diagnostic endpoint to verify Google integrations
  // Access controlled: dev mode only OR requires ADMIN_API_KEY environment variable
  app.get("/api/integrations/verify", async (req, res) => {
    const isDev = process.env.NODE_ENV === 'development';
    
    // In production, require ADMIN_API_KEY environment variable
    if (!isDev) {
      const adminKey = process.env.ADMIN_API_KEY;
      if (!adminKey) {
        return res.status(503).json({ error: "Diagnostic endpoint disabled - ADMIN_API_KEY not configured" });
      }
      
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${adminKey}`) {
        return res.status(401).json({ error: "Unauthorized - valid admin key required" });
      }
    }
    
    const results: any = { driveConnected: false, sheetsConnected: false };
    
    try {
      const driveStatus = await checkDriveConnection();
      results.driveConnected = driveStatus.connected;
    } catch (e: any) {
      results.driveError = "Connection failed";
    }
    
    try {
      await getOrCreateBackupSpreadsheet();
      results.sheetsConnected = true;
    } catch (e: any) {
      results.sheetsError = "Connection failed";
    }
    
    const fs = await import('fs');
    const dataDir = process.env.DATA_DIR || './data';
    results.localDataFilesCount = 0;
    try {
      if (fs.existsSync(dataDir)) {
        results.localDataFilesCount = fs.readdirSync(dataDir).length;
      }
    } catch (e) {}
    
    res.json({
      success: results.driveConnected || results.sheetsConnected,
      ...results
    });
  });

  // Endpoint to record flight telemetry (called when drone is armed)
  app.post("/api/telemetry/record", async (req, res) => {
    try {
      const { 
        sessionId, missionId, droneId, latitude, longitude, altitude, relativeAltitude,
        heading, groundSpeed, verticalSpeed, airSpeed, batteryVoltage, batteryCurrent, 
        batteryPercent, batteryTemp, gpsFixType, gpsSatellites, gpsHdop, flightMode, 
        armed, pitch, roll, yaw, motor1Rpm, motor2Rpm, motor3Rpm, motor4Rpm,
        motor1Current, motor2Current, motor3Current, motor4Current, cpuTemp,
        vibrationX, vibrationY, vibrationZ, distanceFromHome, windSpeed, windDirection
      } = req.body;

      const flightLog = await storage.createFlightLog({
        sessionId,
        missionId,
        droneId,
        latitude,
        longitude,
        altitude,
        relativeAltitude,
        heading,
        groundSpeed,
        verticalSpeed,
        airSpeed,
        batteryVoltage,
        batteryCurrent,
        batteryPercent,
        batteryTemp,
        gpsFixType,
        gpsSatellites,
        gpsHdop,
        flightMode,
        armed: armed || false,
        pitch,
        roll,
        yaw,
        motor1Rpm,
        motor2Rpm,
        motor3Rpm,
        motor4Rpm,
        motor1Current,
        motor2Current,
        motor3Current,
        motor4Current,
        cpuTemp,
        vibrationX,
        vibrationY,
        vibrationZ,
        distanceFromHome,
        windSpeed,
        windDirection
      });

      broadcast("telemetry_recorded", flightLog);
      void appendCloudDocument("flight_logs", flightLog, { session: requestSession(req) }).catch(() => {});
      res.json({ success: true, flightLog });
    } catch (error) {
      res.status(500).json({ error: "Failed to record telemetry" });
    }
  });

  // Flight Session Management - Auto-start recording on takeoff
  app.post("/api/flight-sessions/start", async (req, res) => {
    try {
      const { missionId, droneId } = req.body;
      
      // Check if there's already an active session for this drone
      const existingSession = await storage.getActiveFlightSession(droneId);
      if (existingSession) {
        return res.json({ success: true, session: existingSession, message: "Session already active" });
      }

      const session = await storage.createFlightSession({
        droneId: droneId || null,
        missionId: missionId || null,
        startTime: new Date().toISOString(),
        status: "active",
        totalFlightTime: null,
        maxAltitude: null,
        totalDistance: null,
        videoFilePath: null,
        logFilePath: null,
        model3dFilePath: null,
      });

      broadcast("flight_session_started", session);
      void syncCloudDocument("flight_sessions", session.id, session, { session: requestSession(req) }).catch(() => {});
      console.log(`[FLIGHT] Session ${session.id} started for drone ${droneId}`);
      res.json({ success: true, session });
    } catch (error) {
      console.error("Failed to start flight session:", error);
      res.status(500).json({ error: "Failed to start flight session" });
    }
  });

  app.post("/api/flight-sessions/end", async (req, res) => {
    try {
      const { sessionId, droneId, maxAltitude, totalDistance, totalFlightTime } = req.body;
      
      let session;
      if (sessionId) {
        session = await storage.endFlightSession(sessionId, { maxAltitude, totalDistance, totalFlightTime });
      } else if (droneId) {
        const activeSession = await storage.getActiveFlightSession(droneId);
        if (activeSession) {
          session = await storage.endFlightSession(activeSession.id, { maxAltitude, totalDistance, totalFlightTime });
        }
      }

      if (!session) {
        return res.status(404).json({ error: "No active session found" });
      }

      // Trigger Google sync after flight ends
      try {
        const flightLogs = await storage.getFlightLogsBySession(session.id);
        const allSessions = await storage.getAllFlightSessions();
        await syncDataToSheets({
          flightSessions: allSessions,
          flightLogs: flightLogs.slice(-1000), // Last 1000 logs from this session
        });
        console.log(`[FLIGHT] Session ${session.id} synced to Google Sheets`);
      } catch (syncError) {
        console.error("Failed to sync to Google:", syncError);
      }

      broadcast("flight_session_ended", session);
      void syncCloudDocument("flight_sessions", session.id, session, { session: requestSession(req) }).catch(() => {});
      console.log(`[FLIGHT] Session ${session.id} ended`);
      res.json({ success: true, session });
    } catch (error) {
      console.error("Failed to end flight session:", error);
      res.status(500).json({ error: "Failed to end flight session" });
    }
  });

  app.get("/api/flight-sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllFlightSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get flight sessions" });
    }
  });

  app.get("/api/flight-sessions/active", async (req, res) => {
    try {
      const droneId = req.query.droneId as string | undefined;
      const session = await storage.getActiveFlightSession(droneId);
      res.json({ session: session || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to get active session" });
    }
  });

  app.get("/api/flight-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getFlightSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.patch("/api/flight-sessions/:id", async (req, res) => {
    try {
      const updates = insertFlightSessionSchema.partial().parse(req.body ?? {});
      const session = await storage.updateFlightSession(req.params.id, updates);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      broadcast("flight_session_updated", session);
      void syncCloudDocument("flight_sessions", session.id, session, { session: requestSession(req) }).catch(() => {});
      res.json(session);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromError(error).message });
      }
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.get("/api/flight-sessions/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getFlightLogsBySession(req.params.id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session logs" });
    }
  });

  app.delete("/api/flight-sessions/:id", async (req, res) => {
    try {
      await storage.deleteFlightSession(req.params.id);
      void deleteCloudDocument("flight_sessions", req.params.id).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Servo/Gripper control endpoints (for Raspberry Pi deployment)
  app.post("/api/servo/control", async (req, res) => {
    try {
      const { action, angle } = req.body;
      
      if (!action || !['open', 'close', 'angle'].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Use 'open', 'close', or 'angle'" });
      }
      
      // Check if running on Raspberry Pi
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      // Helper to return simulated response
      const returnSimulated = () => {
        return res.json({ 
          success: true, 
          simulated: true,
          action,
          angle: action === 'open' ? 180 : action === 'close' ? 0 : angle,
          message: `Gripper ${action} (simulated - not on Raspberry Pi)`
        });
      };
      
      // If not on Pi, return simulation
      if (!isRaspberryPi) {
        return returnSimulated();
      }
      
      // On Pi, try to call Python script
      const args = [path.join(SCRIPTS_DIR, 'servo_control.py'), action, '--json'];
      if (action === 'angle' && angle !== undefined) {
        args.push('--value', String(angle));
      }
      
      const python = spawn(PYTHON_EXEC, args);
      let output = '';
      let errorOutput = '';
      let responded = false;
      
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      python.on('error', (err) => {
        if (!responded) {
          responded = true;
          // Python not available, return simulated
          returnSimulated();
        }
      });
      
      python.on('close', (code: number) => {
        if (responded) return;
        responded = true;
        
        if (code !== 0) {
          return res.status(500).json({ 
            error: "Servo control failed", 
            details: errorOutput || output,
            code 
          });
        }
        
        try {
          const result = JSON.parse(output);
          res.json(result);
        } catch (e) {
          res.json({ success: true, message: output.trim() });
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: "Servo control error", details: String(error) });
    }
  });

  app.get("/api/servo/status", async (req, res) => {
    try {
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      res.json({
        available: isRaspberryPi,
        platform: isRaspberryPi ? 'raspberry_pi' : 'other',
        gpio_pin: 4,
        message: isRaspberryPi ? 'Servo controller available' : 'Servo control simulated (not on Raspberry Pi)'
      });
    } catch (error) {
      res.status(500).json({ error: "Status check failed" });
    }
  });

  // Debug endpoint to test Python execution
  app.get("/api/bme688/debug", async (req, res) => {
    const scriptPath = path.join(SCRIPTS_DIR, 'bme688_monitor.py');
    const pythonExec = PYTHON_EXEC;
    
    const python = spawn(pythonExec, [scriptPath, 'status', '--json']);
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    python.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });
    
    python.on('close', (code: number) => {
      res.json({
        pythonExec,
        scriptPath,
        scriptExists: existsSync(scriptPath),
        scriptsDir: SCRIPTS_DIR,
        cwd: process.cwd(),
        exitCode: code,
        stdout: output,
        stderr: errorOutput,
        env: {
          DEVICE_ROLE: process.env.DEVICE_ROLE,
          PATH: process.env.PATH?.substring(0, 200)
        }
      });
    });
    
    python.on('error', (err) => {
      res.json({ error: String(err), pythonExec, scriptPath });
    });
  });

  // BME688 Environmental Sensor endpoints
  app.get("/api/bme688/read", async (req, res) => {
    try {
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      // Helper to return simulated data
      const returnSimulated = () => {
        const temp = 68 + (Math.random() * 10 - 5);
        const humidity = 45 + (Math.random() * 20 - 10);
        const pressure = 1013.25 + (Math.random() * 10 - 5);
        const iaq = Math.floor(50 + Math.random() * 100);
        return res.json({
          success: true,
          simulated: true,
          timestamp: new Date().toISOString(),
          temperature_f: Math.round(temp * 10) / 10,
          temperature_c: Math.round((temp - 32) * 5/9 * 10) / 10,
          humidity: Math.round(humidity * 10) / 10,
          pressure: Math.round(pressure * 100) / 100,
          altitude: Math.round((1013.25 - pressure) * 8.43 * 10) / 10,
          gas_resistance: 50000 + Math.random() * 100000,
          iaq_score: iaq,
          iaq_level: iaq < 50 ? 'Excellent' : iaq < 100 ? 'Good' : iaq < 150 ? 'Moderate' : 'Poor',
          voc_level: Math.round(Math.random() * 500) / 1000,
          vsc_level: Math.round(Math.random() * 100) / 1000,
          co2_level: 400 + Math.floor(Math.random() * 200),
          h2_level: Math.round(Math.random() * 50) / 100,
          co_level: Math.round(Math.random() * 10) / 100,
          ethanol_level: Math.round(Math.random() * 100) / 1000,
          health_risk_level: 'GOOD',
          health_risk_description: 'Air quality is good. No health concerns.'
        });
      };
      
      // For non-Pi environments, return simulated data directly
      if (!isRaspberryPi) {
        return returnSimulated();
      }
      
      // On Pi, call the Python script
      const args = [path.join(SCRIPTS_DIR, 'bme688_monitor.py'), 'read', '--json'];
      
      const python = spawn(PYTHON_EXEC, args);
      let output = '';
      let errorOutput = '';
      let responded = false;
      
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      python.on('error', (err) => {
        if (!responded) {
          responded = true;
          returnSimulated();
        }
      });
      
      python.on('close', (code: number) => {
        if (responded) return;
        responded = true;
        
        if (code !== 0) {
          return res.status(500).json({ 
            error: "BME688 read failed", 
            details: errorOutput || output,
            code 
          });
        }
        
        try {
          const result = JSON.parse(output);
          res.json(result);
        } catch (e) {
          res.status(500).json({ error: "Invalid sensor response" });
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: "BME688 read error", details: String(error) });
    }
  });

  app.get("/api/bme688/status", async (req, res) => {
    try {
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      // For non-Pi environments, return status directly
      if (!isRaspberryPi) {
        return res.json({
          success: true,
          sensorAvailable: false,
          platform: 'other',
          message: 'BME688 sensor simulated (not on Raspberry Pi)'
        });
      }
      
      const python = spawn(PYTHON_EXEC, [path.join(SCRIPTS_DIR, 'bme688_monitor.py'), 'status']);
      let output = '';
      let responded = false;
      
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.on('error', (err) => {
        if (!responded) {
          responded = true;
          res.json({
            success: true,
            sensorAvailable: false,
            platform: 'raspberry_pi',
            message: 'Failed to check sensor status'
          });
        }
      });
      
      python.on('close', (code: number) => {
        if (responded) return;
        responded = true;
        
        try {
          const result = JSON.parse(output);
          result.platform = 'raspberry_pi';
          res.json(result);
        } catch (e) {
          res.json({
            success: true,
            sensorAvailable: false,
            platform: 'raspberry_pi',
            message: 'BME688 sensor status check failed'
          });
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: "Status check failed" });
    }
  });

  app.get("/api/stabilization/status", async (_req, res) => {
    try {
      res.json({ success: true, ...flightDynamicsEngine.getStatus() });
    } catch (error) {
      res.status(500).json({ error: "Failed to get stabilization status" });
    }
  });

  app.post("/api/stabilization/sensors", async (req, res) => {
    try {
      const { sensors, dt } = req.body;
      flightDynamicsEngine.updateSensors(sensors || {}, dt || 0.05);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update sensors" });
    }
  });

  app.post("/api/stabilization/environment", async (req, res) => {
    try {
      flightDynamicsEngine.updateEnvironment(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update environment" });
    }
  });

  app.post("/api/stabilization/payload", async (req, res) => {
    try {
      flightDynamicsEngine.updatePayload(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update payload" });
    }
  });

  app.post("/api/stabilization/compute", async (req, res) => {
    try {
      const { targetAltitude, targetAttitude, cameraFeatures } = req.body;
      const result = flightDynamicsEngine.computeStabilization(
        targetAltitude ?? 20,
        targetAttitude ?? { roll: 0, pitch: 0, yaw: 0 },
        cameraFeatures
      );
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: "Failed to compute stabilization" });
    }
  });

  app.post("/api/stabilization/motors", async (req, res) => {
    try {
      const { rpms } = req.body;
      if (Array.isArray(rpms)) {
        flightDynamicsEngine.updateMotorRpms(rpms);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update motor RPMs" });
    }
  });

  app.get("/api/stabilization/params", async (_req, res) => {
    try {
      res.json({ success: true, params: flightDynamicsEngine.getQuadParams() });
    } catch (error) {
      res.status(500).json({ error: "Failed to get quad params" });
    }
  });

  app.post("/api/stabilization/params", async (req, res) => {
    try {
      flightDynamicsEngine.setQuadParams(req.body);
      res.json({ success: true, params: flightDynamicsEngine.getQuadParams() });
    } catch (error) {
      res.status(500).json({ error: "Failed to update quad params" });
    }
  });

  return httpServer;
}
