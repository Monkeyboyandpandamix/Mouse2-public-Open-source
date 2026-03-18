import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
import { readFile, writeFile, appendFile, mkdir, readdir, chmod, stat, unlink } from "fs/promises";
import path from "path";
import os from "os";
import net from "net";
import { flightDynamicsEngine } from "./flightDynamics";
import {
  authenticateWithPassword,
  createAuthUser,
  deleteAuthUser,
  getAuthenticatedUserById,
  listAuthUsers,
  resetAuthUserPassword,
  updateAuthUser,
} from "./authStore";
import { CommandService, type CommandExecutionResult } from "./commandService";
import { buildPluginToolSpawnSpec, normalizePluginId } from "./pluginToolRunner";
import { normalizeClientRequestId, OfflineSyncIdempotencyStore } from "./offlineSyncIdempotency";

// Use system Python to ensure Adafruit libraries are available
// On Raspberry Pi, venv may not have the hardware libraries but system Python does
const PYTHON_EXEC = process.env.PYTHON_PATH ?? "/usr/bin/python3";

/** Strict allowlists for shell-interpolated params to prevent command injection */
const SAFE_PORT_DEVICE = /^[a-zA-Z0-9/_.\-]+$/;
const SAFE_AT_CMD = /^[A-Za-z0-9&=\?*\#\-]+$/;
const SAFE_HOST = /^[a-zA-Z0-9.\-]+$/;
const SAFE_MOUNT = /^[a-zA-Z0-9_\-]+$/;
const SAFE_USER = /^[a-zA-Z0-9_\-]+$/;
const SAFE_CREDENTIAL = /^[a-zA-Z0-9_\-.\~]+$/;
const SAFE_CONN = /^[a-zA-Z0-9/_.\-:]+$/;

function validateShellArg(value: string, pattern: RegExp, name: string, maxLen = 256): string {
  const v = String(value ?? "").trim();
  if (v.length > maxLen) throw new Error(`Invalid ${name}: too long`);
  if (!pattern.test(v)) throw new Error(`Invalid ${name}: disallowed characters`);
  return v;
}

// Get absolute path to scripts directory (works regardless of cwd)
const SCRIPTS_DIR = path.resolve(process.cwd(), "scripts");

/** Strict allowlist for values substituted into shell commands. Rejects shell metacharacters. */
function allowlistShellArg(value: string, kind: "port" | "cmd" | "host" | "mount" | "user" | "pass" | "conn"): string {
  const s = String(value || "").trim();
  const patterns: Record<string, RegExp> = {
    port: /^[a-zA-Z0-9\/_\-\.]+$/,
    cmd: /^[A-Za-z0-9\&\=\?\*\#\-]+$/,
    host: /^[a-zA-Z0-9\.\-]+$/,
    mount: /^[a-zA-Z0-9_\-]+$/,
    user: /^[a-zA-Z0-9_\-]+$/,
    pass: /^[^\s\;\,\|\&\$\`\'\"\\<>]*$/,
    conn: /^[a-zA-Z0-9\/_\-\.\:\,]+$/,
  };
  if (!patterns[kind].test(s) || s.length > 512) {
    throw new Error(`Invalid ${kind} parameter: disallowed characters or length`);
  }
  return s;
}
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
  logCloudErr,
  publishCloudRealtime,
  syncCloudDocument,
  uploadCloudStorageObject,
} from "./cloudSync";
import { startCloudRetryQueue } from "./cloudRetryQueue";
import { getFirebaseAdminDb, getFirebaseAdminRtdb, getFirebaseAdminStorage, resetFirebaseAdminApp } from "./firebaseAdmin";
import {
  getSession,
  setSession,
  deleteSession,
  getSessionMap,
  revokeUserSessions as revokeUserSessionsStore,
  refreshUserSessions as refreshUserSessionsStore,
  loadSessionsAtStartup,
  type ServerSession,
} from "./sessionStore";
import { rateLimitMiddleware } from "./rateLimit";
import { HARDCODED_FIREBASE_PROJECT } from "@shared/hardcodedFirebaseConfig";
import { ROLE_PERMISSIONS, type PermissionId } from "@shared/permissions";
import { 
  getAuthUrl, 
  handleOAuthCallback, 
  checkConnectionStatus, 
  getAllAccounts, 
  switchAccount, 
  removeAccount,
  isOAuthConfigured 
} from "./googleAuth";

const commandService = new CommandService();
const offlineSyncIdempotency = new OfflineSyncIdempotencyStore();
interface MissionRunRecord {
  id: string;
  missionId: string;
  status: "queued" | "uploading" | "arming" | "starting" | "running" | "completed" | "stopped" | "failed";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  connectionString: string;
  commandIds: string[];
  expectedCompletionAt?: string | null;
  completedAt?: string | null;
  completionSource?: "fc_progress" | "explicit_signal";
  waypointCount?: number | null;
  currentWaypointIndex?: number | null;
  progressUpdatedAt?: string | null;
}
const missionRuns = new Map<string, MissionRunRecord>();
const missionRunProgressMonitors = new Map<string, NodeJS.Timeout>();
interface AutomationRunRecord {
  id: string;
  scriptId: string;
  scriptName: string;
  trigger: string;
  reason: string;
  status: "queued" | "running" | "completed" | "failed";
  error: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
  commandId: string | null;
  requestedBy: {
    userId: string;
    role: string;
    name: string;
  };
}
const automationRuns = new Map<string, AutomationRunRecord>();
const oauthStateStore = new Map<string, { createdAt: number; userId: string | null }>();
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
const DATA_DIR = path.resolve(process.cwd(), "data");
const CLOUD_RUNTIME_CONFIG_FILE = path.join(DATA_DIR, "cloud_runtime_config.json");
const RTK_PROFILE_FILE = path.join(DATA_DIR, "rtk_profiles.json");
const RUNTIME_STATE_FILE = path.join(DATA_DIR, "runtime_state.json");
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

interface PersistedRuntimeState {
  version: number;
  savedAt: string;
  missionRuns: MissionRunRecord[];
  automationRuns?: AutomationRunRecord[];
  serialPassthroughState?: {
    running: boolean;
    command: string;
    startedAt: string | null;
    message: string;
  };
  rtkNtripState?: {
    running: boolean;
    command: string;
    startedAt: string | null;
    host: string;
    port: number;
    mountpoint: string;
    message: string;
  };
  gpsInjectState?: {
    running: boolean;
    command: string;
    startedAt: string | null;
    profileId: string;
    message: string;
  };
  firmwareState?: {
    busy: boolean;
    progress: number;
    status: "idle" | "running" | "completed" | "failed";
    message: string;
    lastRunAt: string | null;
  };
  calibrationState?: Record<string, { status: "idle" | "running" | "completed" | "failed"; lastRunAt: string | null; message?: string; ack?: number | null }>;
  audioState?: {
    deviceType: "gpio" | "usb" | "buzzer";
    deviceId: string;
    volume: number;
    live: { active: boolean; source: string; startedAt: string | null };
    droneMic: { enabled: boolean; listening: boolean; volume: number; updatedAt: string | null };
    lastTtsAt: string | null;
    lastBuzzerTone: string | null;
  };
  mappingState?: {
    active: boolean;
    framesCaptured: number;
    coveragePercent: number;
    confidence: number;
    trackX: number;
    trackY: number;
    distanceEstimate: number;
    coverageBins: string[];
    trajectory: Array<{ x: number; y: number; t: number; conf: number }>;
    lastFrameAt: string | null;
    lastModelPath: string | null;
    lastModelGeneratedAt: string | null;
  };
}

let runtimeStateFlushTimer: NodeJS.Timeout | null = null;

const persistRuntimeState = async () => {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const payload: PersistedRuntimeState = {
      version: 1,
      savedAt: new Date().toISOString(),
      missionRuns: Array.from(missionRuns.values()),
      automationRuns: Array.from(automationRuns.values()),
      serialPassthroughState: { ...serialPassthroughState },
      rtkNtripState: { ...rtkNtripState },
      gpsInjectState: { ...gpsInjectState },
      firmwareState: { ...firmwareState },
      calibrationState: { ...calibrationState },
      audioState: {
        ...audioState,
        live: { ...audioState.live },
        droneMic: { ...audioState.droneMic },
      },
      mappingState: {
        ...mappingState,
        coverageBins: Array.from(mappingState.coverageBins),
        trajectory: [...mappingState.trajectory],
      },
    };
    await writeFile(RUNTIME_STATE_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    console.warn("[runtime-state] failed to persist runtime state:", (error as any)?.message || String(error));
  }
};

const scheduleRuntimeStatePersist = () => {
  if (runtimeStateFlushTimer) {
    clearTimeout(runtimeStateFlushTimer);
  }
  runtimeStateFlushTimer = setTimeout(() => {
    runtimeStateFlushTimer = null;
    void persistRuntimeState();
  }, 250);
};

const setMissionRunRecord = (runId: string, run: MissionRunRecord) => {
  missionRuns.set(runId, run);
  scheduleRuntimeStatePersist();
};

const stopMissionRunProgressMonitor = (runId: string) => {
  const existing = missionRunProgressMonitors.get(runId);
  if (existing) {
    clearInterval(existing);
    missionRunProgressMonitors.delete(runId);
  }
};

const stopAllMissionRunProgressMonitors = () => {
  Array.from(missionRunProgressMonitors.values()).forEach((timer) => {
    clearInterval(timer);
  });
  missionRunProgressMonitors.clear();
};

const loadRuntimeState = async () => {
  try {
    await loadSessionsAtStartup();

    if (!existsSync(RUNTIME_STATE_FILE)) return;
    const raw = await readFile(RUNTIME_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedRuntimeState>;
    const runs = Array.isArray(parsed?.missionRuns) ? parsed.missionRuns : [];
    const automation = Array.isArray(parsed?.automationRuns) ? parsed.automationRuns : [];

    const restartedAt = new Date().toISOString();
    for (const run of runs) {
      if (!run || typeof run !== "object") continue;
      const runId = String((run as any).id || "").trim();
      if (!runId) continue;
      const normalized: MissionRunRecord = {
        id: runId,
        missionId: String((run as any).missionId || ""),
        status: (run as any).status || "failed",
        error: (run as any).error ?? null,
        createdAt: String((run as any).createdAt || restartedAt),
        updatedAt: String((run as any).updatedAt || restartedAt),
        connectionString: String((run as any).connectionString || ""),
        commandIds: Array.isArray((run as any).commandIds) ? (run as any).commandIds.map((id: any) => String(id)) : [],
        expectedCompletionAt: (run as any).expectedCompletionAt ?? null,
        completedAt: (run as any).completedAt ?? null,
        completionSource: (run as any).completionSource,
        waypointCount: Number.isFinite(Number((run as any).waypointCount)) ? Number((run as any).waypointCount) : null,
        currentWaypointIndex: Number.isFinite(Number((run as any).currentWaypointIndex)) ? Number((run as any).currentWaypointIndex) : null,
        progressUpdatedAt: (run as any).progressUpdatedAt ?? null,
      };

      if (["uploading", "arming", "starting", "running", "queued"].includes(normalized.status)) {
        normalized.status = "failed";
        normalized.error = normalized.error || "Mission run interrupted by server restart";
        normalized.updatedAt = restartedAt;
      }

      missionRuns.set(runId, normalized);
    }

    automationRuns.clear();
    for (const run of automation) {
      if (!run || typeof run !== "object") continue;
      const runId = String((run as any).id || "").trim();
      if (!runId) continue;
      automationRuns.set(runId, {
        id: runId,
        scriptId: String((run as any).scriptId || ""),
        scriptName: String((run as any).scriptName || ""),
        trigger: String((run as any).trigger || "manual"),
        reason: String((run as any).reason || ""),
        status: (run as any).status || "failed",
        error: (run as any).error ?? null,
        result: (run as any).result ?? null,
        createdAt: String((run as any).createdAt || restartedAt),
        updatedAt: String((run as any).updatedAt || restartedAt),
        commandId: (run as any).commandId ?? null,
        requestedBy: {
          userId: String((run as any)?.requestedBy?.userId || ""),
          role: String((run as any)?.requestedBy?.role || "viewer"),
          name: String((run as any)?.requestedBy?.name || "User"),
        },
      });
    }

    if (parsed?.serialPassthroughState) Object.assign(serialPassthroughState, parsed.serialPassthroughState);
    if (parsed?.rtkNtripState) Object.assign(rtkNtripState, parsed.rtkNtripState);
    if (parsed?.gpsInjectState) Object.assign(gpsInjectState, parsed.gpsInjectState);
    if (parsed?.firmwareState) Object.assign(firmwareState, parsed.firmwareState);
    if (parsed?.calibrationState && typeof parsed.calibrationState === "object") {
      Object.assign(calibrationState, parsed.calibrationState);
    }
    if (parsed?.audioState) {
      Object.assign(audioState, parsed.audioState, {
        live: { ...audioState.live, ...(parsed.audioState.live || {}) },
        droneMic: { ...audioState.droneMic, ...(parsed.audioState.droneMic || {}) },
      });
    }
    if (parsed?.mappingState) {
      Object.assign(mappingState, parsed.mappingState);
      mappingState.coverageBins = new Set(Array.isArray(parsed.mappingState.coverageBins) ? parsed.mappingState.coverageBins : []);
      mappingState.trajectory = Array.isArray(parsed.mappingState.trajectory) ? parsed.mappingState.trajectory : [];
    }
  } catch (error) {
    console.warn("[runtime-state] failed to load runtime state:", (error as any)?.message || String(error));
  }
};

// Generate a cryptographically secure random token
function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars, 256 bits of entropy
}

// Validate session token (sync; reads from memory cache; Firestore used for persistence)
function validateSession(token: string | undefined): ServerSession | null {
  if (!token) return null;
  const session = getSessionMap().get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    void deleteSession(token);
    return null;
  }
  return session;
}

function requestSession(req: any): ServerSession | null {
  const token = req.headers["x-session-token"] as string | undefined;
  return validateSession(token);
}

function hasServerPermission(session: ServerSession | null, permission: PermissionId): boolean {
  if (!session) return false;
  const role = String(session.role || "viewer").toLowerCase();
  if (role === "admin") return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function requireAuth(req: any, res: any, next: any) {
  const session = requestSession(req);
  if (!session) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  req.serverSession = session;
  next();
}

function requirePermission(permission: PermissionId) {
  return (req: any, res: any, next: any) => {
    const session = requestSession(req);
    if (!session) {
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

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/google/callback",
  "/api/runtime-config",
]);

function apiPermissionForRequest(apiPath: string, method: string, body?: any): PermissionId | null {
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
  if (normalizedPath.startsWith("/api/auth/")) return null;
  return null;
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

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusM = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>,
) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation(a: { lat: number; lng: number }, b: { lat: number; lng: number }, c: { lat: number; lng: number }) {
  const value = (b.lng - a.lng) * (c.lat - b.lat) - (b.lat - a.lat) * (c.lng - b.lng);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: { lat: number; lng: number }, b: { lat: number; lng: number }, c: { lat: number; lng: number }) {
  return (
    Math.min(a.lng, c.lng) <= b.lng &&
    b.lng <= Math.max(a.lng, c.lng) &&
    Math.min(a.lat, c.lat) <= b.lat &&
    b.lat <= Math.max(a.lat, c.lat)
  );
}

function segmentsIntersect(
  p1: { lat: number; lng: number },
  q1: { lat: number; lng: number },
  p2: { lat: number; lng: number },
  q2: { lat: number; lng: number },
) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function segmentIntersectsPolygon(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>,
) {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(a, b, p1, p2)) return true;
  }
  return false;
}

function segmentIntersectsCircle(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusMeters: number,
) {
  const earthRadiusM = 6371000;
  const toLocal = (p: { lat: number; lng: number }) => ({
    x: toRadians(p.lng - center.lng) * earthRadiusM * Math.cos(toRadians(center.lat)),
    y: toRadians(p.lat - center.lat) * earthRadiusM,
  });

  const ap = toLocal(a);
  const bp = toLocal(b);
  const abx = bp.x - ap.x;
  const aby = bp.y - ap.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) {
    const d2 = ap.x * ap.x + ap.y * ap.y;
    return d2 <= radiusMeters * radiusMeters;
  }
  const t = Math.max(0, Math.min(1, ((-ap.x) * abx + (-ap.y) * aby) / ab2));
  const closestX = ap.x + t * abx;
  const closestY = ap.y + t * aby;
  const d2 = closestX * closestX + closestY * closestY;
  return d2 <= radiusMeters * radiusMeters;
}

function missionSegmentsIntersectZones(
  waypoints: Array<{ latitude: number; longitude: number }>,
  zones: AirspaceZone[],
) {
  const blockers: AirspaceZone[] = [];
  if (waypoints.length < 2 || zones.length === 0) return blockers;

  const segments = waypoints.slice(0, -1).map((wp, i) => ({
    a: { lat: Number(wp.latitude), lng: Number(wp.longitude) },
    b: { lat: Number(waypoints[i + 1].latitude), lng: Number(waypoints[i + 1].longitude) },
  }));

  for (const zone of zones) {
    const points = Array.isArray(zone.points) ? zone.points : [];
    const zoneEnabled = zone.enabled !== false;
    if (!zoneEnabled) continue;

    const intersects = segments.some((segment) => {
      if (zone.type === "circle" && zone.center && Number.isFinite(Number(zone.radius))) {
        return segmentIntersectsCircle(segment.a, segment.b, zone.center, Number(zone.radius || 0));
      }
      if ((zone.type === "polygon" || zone.type === "custom") && points.length >= 3) {
        return segmentIntersectsPolygon(segment.a, segment.b, points);
      }
      if (points.length >= 3) {
        return segmentIntersectsPolygon(segment.a, segment.b, points);
      }
      return false;
    });

    if (intersects) blockers.push(zone);
  }

  return blockers;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await loadRuntimeState();
  startCloudRetryQueue();

  app.use("/api", (req: any, res: any, next: any) => {
    const apiPath = `${req.baseUrl || ""}${req.path || ""}`;
    if (PUBLIC_API_PATHS.has(apiPath)) {
      return next();
    }

    const session = requestSession(req);
    if (!session) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    req.serverSession = session;
    const requiredPermission = apiPermissionForRequest(apiPath, req.method, req.body);
    if (requiredPermission && !hasServerPermission(session, requiredPermission)) {
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions: ${requiredPermission} required`,
      });
    }

    return next();
  });

  // DataFlash 48-hour cleanup: remove GROUND-STATION copies only.
  // These are .bin files downloaded from the FC for post-flight analysis. The flight controller
  // (Pixhawk/ArduPilot) keeps its own DataFlash logs on the FC's SD card — we never touch those.
  // This cleanup does NOT affect: flight_logs, sensor_data, telemetry, or any data used by
  // GPS-denied navigation, dead reckoning, or return-to-home. The drone's local onboard storage
  // (FC SD card) is entirely independent and retains all flight data for GPS-denied operation.
  const DATAFLASH_AGE_MS = 48 * 60 * 60 * 1000;
  const dataflashLogsDir = path.resolve(process.env.DATA_DIR || "./data", "dataflash");
  const runDataflashCleanup = async () => {
    try {
      if (!existsSync(dataflashLogsDir)) return;
      const files = await readdir(dataflashLogsDir);
      const cutoff = Date.now() - DATAFLASH_AGE_MS;
      let removed = 0;
      for (const name of files) {
        if (!name.endsWith(".bin")) continue;
        const fp = path.join(dataflashLogsDir, name);
        try {
          const s = await stat(fp);
          if (s.mtimeMs < cutoff) {
            await unlink(fp);
            removed++;
          }
        } catch {
          // skip unreadable or missing files
        }
      }
      if (removed > 0) console.log(`[dataflash-cleanup] removed ${removed} log(s) older than 48h`);
    } catch (err) {
      console.warn("[dataflash-cleanup]", (err as any)?.message || err);
    }
  };
  setInterval(() => void runDataflashCleanup(), 60 * 60 * 1000);
  void runDataflashCleanup();

  // WebSocket server for real-time telemetry streaming
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Track clients with their user IDs for DM privacy
  interface ClientInfo {
    ws: WebSocket;
    userId: string | null;
    session: ServerSession | null;
    authenticated: boolean;
    authDeadlineTimer: NodeJS.Timeout | null;
  }
  const clients = new Map<WebSocket, ClientInfo>();

  const wsEventPermission = (type: string): PermissionId | null => {
    const normalized = String(type || "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith("debug")) return "system_settings";
    if (
      normalized === "telemetry" ||
      normalized === "telemetry_recorded" ||
      normalized === "sensor_data" ||
      normalized === "motor_telemetry" ||
      normalized === "adsb" ||
      normalized === "adsb_update" ||
      normalized === "drone_telemetry" ||
      normalized === "cloud_telemetry"
    ) {
      return "view_telemetry";
    }
    if (
      normalized.includes("airspace") ||
      normalized.includes("map") ||
      normalized.includes("mission_execution") ||
      normalized === "mission_updated"
    ) {
      return "view_map";
    }
    if (normalized.startsWith("audio_")) return "broadcast_audio";
    return null;
  };

  const canReceiveWsEvent = (clientInfo: ClientInfo, type: string) => {
    if (!clientInfo.authenticated || !clientInfo.session) return false;
    const requiredPermission = wsEventPermission(type);
    if (!requiredPermission) return true;
    return hasServerPermission(clientInfo.session, requiredPermission);
  };

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
      if (clientInfo.ws.readyState === WebSocket.OPEN && canReceiveWsEvent(clientInfo, "debug_event")) {
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
    const runningInCloud =
      Boolean(process.env.K_SERVICE) ||
      Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
      String(process.env.PORT || "") === "8080";
    const hardcoded = {
      projectId: HARDCODED_FIREBASE_PROJECT.projectId || null,
      databaseURL: HARDCODED_FIREBASE_PROJECT.databaseURL || null,
      storageBucket: HARDCODED_FIREBASE_PROJECT.storageBucket || null,
      serviceAccountPath: runningInCloud ? null : (HARDCODED_FIREBASE_PROJECT.serviceAccountPath || null),
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

  const hasOperatorControlPermission = (session: ServerSession | null) => {
    if (!session) return false;
    const role = String(session.role || "").toLowerCase();
    return role === "admin" || role === "operator";
  };

  const hasTelemetryReadPermission = (session: ServerSession | null) => {
    if (!session) return false;
    return hasServerPermission(session, "view_telemetry") || hasOperatorControlPermission(session);
  };

  const hasValidAdminKey = (req: any) => {
    const adminKey = process.env.ADMIN_API_KEY;
    const authHeader = String(req.headers.authorization || "");
    return Boolean(adminKey && authHeader === `Bearer ${adminKey}`);
  };

  const commandPermissionForType = (type: string): PermissionId => {
    const normalized = String(type || "").trim().toLowerCase();
    if (normalized === "arm" || normalized === "disarm") return "arm_disarm";
    if (normalized === "terminal" || normalized === "terminal_command" || normalized === "run_terminal") return "run_terminal";
    return "flight_control";
  };
  
  wss.on("connection", (ws) => {
    // Deny-by-default: clients must complete auth handshake before receiving protected events.
    const clientInfo: ClientInfo = { ws, userId: null, session: null, authenticated: false, authDeadlineTimer: null };
    clients.set(ws, clientInfo);
    console.log("WebSocket client connected");

    clientInfo.authDeadlineTimer = setTimeout(() => {
      if (!clientInfo.authenticated && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "auth_required", data: { error: "Authentication required" } }));
        } catch {}
        ws.close(1008, "Authentication required");
      }
    }, 8000);
    
    // Handle incoming messages to register user ID
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.sessionToken) {
          // Validate token against server session store
          const session = validateSession(msg.sessionToken);
          if (session) {
            clientInfo.userId = session.userId;
            clientInfo.session = session;
            clientInfo.authenticated = true;
            if (clientInfo.authDeadlineTimer) {
              clearTimeout(clientInfo.authDeadlineTimer);
              clientInfo.authDeadlineTimer = null;
            }
            ws.send(JSON.stringify({
              type: "auth_ok",
              data: { userId: session.userId, role: session.role, name: session.name },
            }));
            console.log(`WebSocket client authenticated as user: ${session.userId} (${session.name})`);
          } else {
            console.log("WebSocket auth failed: invalid or expired session token");
            ws.send(JSON.stringify({ type: "auth_failed", data: { error: "Invalid or expired session token" } }));
          }
          return;
        }

        if (!clientInfo.authenticated) {
          ws.send(JSON.stringify({ type: "auth_required", data: { error: "Authenticate before sending commands" } }));
          return;
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    ws.on("close", () => {
      if (clientInfo.authDeadlineTimer) {
        clearTimeout(clientInfo.authDeadlineTimer);
        clientInfo.authDeadlineTimer = null;
      }
      clients.delete(ws);
      console.log("WebSocket client disconnected");
    });
  });
  
  // Broadcast function for real-time data (non-DM messages)
  const broadcast = (type: string, data: any) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN && canReceiveWsEvent(clientInfo, type)) {
        clientInfo.ws.send(message);
      }
    });
    void publishCloudRealtime(type, data).catch(logCloudErr);
  };

  // Send to specific users only (for DMs)
  const sendToUsers = (type: string, data: any, userIds: string[]) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN && 
          clientInfo.authenticated &&
          clientInfo.userId && 
          userIds.includes(clientInfo.userId)) {
        clientInfo.ws.send(message);
      }
    });
  };

  // Smart broadcast - handles DMs privately, broadcasts public messages
  const smartBroadcast = (type: string, data: any) => {
    const recipients = Array.isArray(data?.recipients)
      ? data.recipients
          .filter((r: any) => r?.type === "user" && String(r?.id || "").trim())
          .map((r: any) => String(r.id))
      : [];
    const legacyRecipient = String(data?.recipientId || "").trim();
    const isDirect = Boolean(legacyRecipient || recipients.length > 0);

    if (isDirect) {
      const targetUsers = Array.from(
        new Set([String(data?.senderId || "").trim(), legacyRecipient, ...recipients].filter(Boolean)),
      );
      sendToUsers(type, data, targetUsers);
    } else {
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
      void syncCloudDocument("media_assets", asset.id, asset, { session }).catch(logCloudErr);
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
    void syncCloudDocument("media_assets", asset.id, asset, { session }).catch(logCloudErr);
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
            void syncCloudDocument("media_assets", updated.id, updated, { session }).catch(logCloudErr);
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
    void syncPendingMediaBacklog(null).catch(logCloudErr);
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

  const isRaspberryPiRuntime = () =>
    process.env.DEVICE_ROLE === "ONBOARD" || existsSync("/sys/firmware/devicetree/base/model");

  const parseTerminalCommand = (raw: string): { type: string; payload?: Record<string, unknown> } | null => {
    let command = String(raw || "").trim();
    if (!command) return null;
    // Compound takeoff: "mavlink_shell 'mode guided' && mavlink_shell 'takeoff N'"
    const takeoffMatch = command.match(/mavlink_shell\s+'takeoff\s+(\d+(?:\.\d+)?)'/i);
    if (takeoffMatch) return { type: "takeoff", payload: { altitude: Number(takeoffMatch[1]) || 20 } };
    // For compound commands (e.g. "mavlink_shell 'X' && sleep 2 && echo Y"), parse the first segment
    if (command.includes("&&") || command.includes(";")) {
      const first = command.split(/&&|;/)[0]?.trim() || "";
      if (first) command = first;
    }
    if (command.includes("|")) return null;

    if (/^mavlink_shell\s+'arm throttle'$/i.test(command)) return { type: "arm" };
    if (/^mavlink_shell\s+'disarm(?: force)?'$/i.test(command)) return { type: "disarm" };
    if (/^mavlink_shell\s+'reboot'$/i.test(command)) return { type: "reboot" };
    const modeMatch = command.match(/^mavlink_shell\s+'mode\s+([a-z0-9_]+)'$/i);
    if (modeMatch) return { type: "set_mode", payload: { mode: String(modeMatch[1]).toUpperCase() } };
    if (/^mavlink_shell\s+'servo set 9 2000'$/i.test(command)) return { type: "gripper_open" };
    if (/^mavlink_shell\s+'servo set 9 1000'$/i.test(command)) return { type: "gripper_close" };
    const gimbalPitchMatch = command.match(/^mavlink_shell\s+'gimbal pitch\s+(-?\d+(?:\.\d+)?)'$/i);
    if (gimbalPitchMatch) return { type: "gimbal", payload: { pitch: Number(gimbalPitchMatch[1]) ?? -45 } };
    return null;
  };

  const resolveUnifiedCommand = (
    rawType: string,
    payload: Record<string, unknown>,
  ): { type: string; payload: Record<string, unknown> } | null => {
    const type = String(rawType || "").trim().toLowerCase();
    if (!type) return null;

    if (type === "terminal" || type === "terminal_command") {
      const parsed = parseTerminalCommand(String(payload.command || ""));
      return parsed ? { type: parsed.type, payload: parsed.payload || {} } : null;
    }

    if (type === "mission_start") return { type: "set_mode", payload: { mode: "AUTO" } };
    if (type === "mission_stop") return { type: "set_mode", payload: { mode: "LAND" } };
    if (type === "abort") return { type: "disarm", payload: {} };
    if (type === "backtrace") return { type: "backtrace", payload };
    if (type === "takeoff") {
      const altitude = Number(payload.altitude ?? payload.targetAltitude ?? 20);
      return { type: "takeoff", payload: { altitude: Number.isFinite(altitude) ? altitude : 20 } };
    }
    if (type === "rtl") return { type: "set_mode", payload: { mode: "RTL" } };
    if (type === "land") return { type: "set_mode", payload: { mode: "LAND" } };
    if (type === "loiter") return { type: "set_mode", payload: { mode: "LOITER" } };
    if (type === "guided") return { type: "set_mode", payload: { mode: "GUIDED" } };
    if (type === "auto") return { type: "set_mode", payload: { mode: "AUTO" } };
    if (type === "gimbal") {
      const pitch = Number(payload.pitch ?? -45);
      return { type: "gimbal", payload: { pitch: Number.isFinite(pitch) ? pitch : -45, yaw: Number(payload.yaw ?? 0) } };
    }
    if (["arm", "disarm", "reboot", "gripper_open", "gripper_close", "set_mode", "takeoff", "gimbal"].includes(type)) {
      return { type, payload };
    }
    return null;
  };

  const executeUnifiedCommand = async (opts: {
    type: string;
    payload: Record<string, unknown>;
    connectionString: string;
  }): Promise<CommandExecutionResult> => {
    const type = String(opts.type || "").toLowerCase();
    const payload = opts.payload || {};
    const connectionString = String(opts.connectionString || "").trim();

    if (type === "gripper_open" || type === "gripper_close") {
      if (!isRaspberryPiRuntime()) {
        return {
          ok: false,
          acknowledged: false,
          error: "Gripper hardware command disabled when not running on onboard hardware",
        };
      }
      const action = type === "gripper_open" ? "open" : "close";
      const args = [path.join(SCRIPTS_DIR, "servo_control.py"), action, "--json"];
      const run = await execCommand(PYTHON_EXEC, args);
      if (!run.ok) {
        return {
          ok: false,
          acknowledged: false,
          error: run.stderr || run.stdout || "Servo command failed",
        };
      }
      try {
        const parsed = JSON.parse((run.stdout || "").trim() || "{}");
        if (parsed?.success) {
          return { ok: true, acknowledged: true, result: parsed };
        }
        return { ok: false, acknowledged: false, error: parsed?.error || "Servo command failed", result: parsed };
      } catch {
        return { ok: false, acknowledged: false, error: "Invalid servo response" };
      }
    }

    if (!connectionString) {
      return { ok: false, acknowledged: false, error: "connectionString is required" };
    }

    if (type === "backtrace") {
      const download = await runMissionDownloadBridge(connectionString);
      if (!download.ok) {
        return {
          ok: false,
          acknowledged: false,
          error: download.error || "Backtrace failed: could not read mission from flight controller",
        };
      }

      const fcWaypoints = Array.isArray(download.data?.waypoints) ? download.data.waypoints : [];
      const reversible = fcWaypoints.filter((wp: any) => {
        const lat = Number(wp?.lat);
        const lng = Number(wp?.lng);
        const alt = Number(wp?.altitude ?? wp?.alt);
        return Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(alt);
      });
      if (reversible.length < 2) {
        return {
          ok: false,
          acknowledged: false,
          error: "Backtrace requires at least 2 valid waypoints on the flight controller mission",
        };
      }

      const reversed = reversible
        .slice()
        .reverse()
        .map((wp: any, idx: number) => {
          const action = String(wp?.action || "flythrough").toLowerCase();
          const unsafeStartAction = action === "rtl" || action === "land" || action === "takeoff";
          return {
            order: idx + 1,
            lat: Number(wp.lat),
            lng: Number(wp.lng),
            altitude: Number(wp.altitude ?? wp.alt ?? 30),
            action: unsafeStartAction && idx === 0 ? "flythrough" : action,
            actionParams: wp?.actionParams && typeof wp.actionParams === "object" ? wp.actionParams : {},
            current: idx === 0 ? 1 : 0,
            autocontinue: 1,
          };
        });

      const upload = await runMissionUploadBridge(connectionString, reversed);
      if (!upload.ok) {
        return {
          ok: false,
          acknowledged: false,
          error: upload.error || "Backtrace failed: could not upload reversed mission",
        };
      }

      const modeSet = await runMavlinkVehicleControl([
        "action",
        "--connection",
        connectionString,
        "--action",
        "set_mode",
        "--mode",
        "AUTO",
        "--timeout",
        "10",
      ]);
      if (!modeSet.ok || modeSet.data?.ack == null) {
        return {
          ok: false,
          acknowledged: false,
          error: modeSet.error || modeSet.data?.error || "Backtrace uploaded but AUTO mode start was not acknowledged",
          result: modeSet.data,
        };
      }

      return {
        ok: true,
        acknowledged: true,
        result: {
          ack: modeSet.data?.ack,
          downloadedItems: fcWaypoints.length,
          uploadedItems: reversed.length,
        },
      };
    }

    const mavAction =
      type === "set_mode"
        ? "set_mode"
        : type === "arm"
          ? "arm"
          : type === "disarm"
            ? "disarm"
            : type === "reboot"
              ? "reboot"
              : type === "takeoff"
                ? "takeoff"
                : type === "gimbal"
                  ? "gimbal"
                  : null;
    if (!mavAction) {
      return {
        ok: false,
        acknowledged: false,
        error: `Unsupported command type: ${type}`,
      };
    }

    const args = ["action", "--connection", connectionString, "--action", mavAction, "--timeout", "10"];
    if (mavAction === "set_mode") {
      const mode = String(payload.mode || "").trim().toUpperCase();
      if (!mode) {
        return { ok: false, acknowledged: false, error: "mode is required for set_mode" };
      }
      args.push("--mode", mode);
    } else if (mavAction === "takeoff") {
      const altitude = Number(payload.altitude ?? payload.targetAltitude ?? 20);
      if (!Number.isFinite(altitude) || altitude <= 0) {
        return { ok: false, acknowledged: false, error: "altitude must be a positive number for takeoff" };
      }
      args.push("--altitude", String(altitude));
    } else if (mavAction === "gimbal") {
      const pitch = Number(payload.pitch ?? -45);
      const yaw = Number(payload.yaw ?? 0);
      args.push("--pitch", String(Number.isFinite(pitch) ? pitch : -45), "--yaw", String(Number.isFinite(yaw) ? yaw : 0));
    }

    const result = await runMavlinkVehicleControl(args);
    if (!result.ok) {
      return { ok: false, acknowledged: false, error: result.error || "Vehicle command failed", result: result.data };
    }

    const ack = result.data?.ack;
    const acknowledged = ack !== null && ack !== undefined;
    if (!acknowledged) {
      return {
        ok: false,
        acknowledged: false,
        error: "Vehicle did not provide ACK",
        result: result.data,
      };
    }
    return { ok: true, acknowledged: true, result: result.data };
  };

  const runMissionUploadBridge = async (connectionString: string, waypoints: any[]) => {
    return await new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
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
          if (parsed?.success) return resolve({ ok: true, data: parsed });
          return resolve({ ok: false, error: parsed?.error || err || "Mission upload failed" });
        } catch {
          return resolve({ ok: false, error: err || "Invalid mission bridge response" });
        }
      });
    });
  };

  const runMissionDownloadBridge = async (connectionString: string) => {
    return await new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
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
          if (parsed?.success) return resolve({ ok: true, data: parsed });
          return resolve({ ok: false, error: parsed?.error || err || "Mission download failed" });
        } catch {
          return resolve({ ok: false, error: err || "Invalid mission bridge response" });
        }
      });
    });
  };

  const markMissionRunCompleted = async (
    run: MissionRunRecord,
    source: "fc_progress" | "explicit_signal",
    session?: ServerSession | null,
  ) => {
    stopMissionRunProgressMonitor(run.id);
    run.status = "completed";
    run.error = null;
    run.completedAt = new Date().toISOString();
    run.completionSource = source;
    run.updatedAt = run.completedAt;
    setMissionRunRecord(run.id, run);
    broadcast("mission_execution_update", run);
    await appendCloudDocument("mission_runs", run, { session: session || null }).catch(logCloudErr);
  };

  const refreshMissionRunProgressFromFlightController = async (run: MissionRunRecord) => {
    if (run.status !== "running") return;
    const fcMission = await runMissionDownloadBridge(run.connectionString);
    if (!fcMission.ok) {
      pushDebugEvent("warn", "mission.progress", "Mission progress poll failed", {
        runId: run.id,
        missionId: run.missionId,
        error: fcMission.error || "Mission download bridge failed",
      });
      return;
    }

    const waypoints = Array.isArray(fcMission.data?.waypoints) ? fcMission.data.waypoints : [];
    const waypointCount = waypoints.length;
    const currentIndex = waypoints.findIndex((wp: any) => Number(wp?.current) === 1);
    run.waypointCount = waypointCount;
    run.currentWaypointIndex = currentIndex >= 0 ? currentIndex : null;
    run.progressUpdatedAt = new Date().toISOString();
    run.updatedAt = run.progressUpdatedAt;
    setMissionRunRecord(run.id, run);
    broadcast("mission_execution_update", run);

    if (waypointCount > 0 && currentIndex >= waypointCount - 1) {
      await markMissionRunCompleted(run, "fc_progress", null);
    }
  };

  const startMissionRunProgressMonitor = (runId: string) => {
    stopMissionRunProgressMonitor(runId);
    const timer = setInterval(() => {
      const activeRun = missionRuns.get(runId);
      if (!activeRun) {
        stopMissionRunProgressMonitor(runId);
        return;
      }
      if (activeRun.status !== "running") {
        stopMissionRunProgressMonitor(runId);
        return;
      }
      void refreshMissionRunProgressFromFlightController(activeRun);
    }, 4000);
    missionRunProgressMonitors.set(runId, timer);
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
  app.use("/api/chat-users", requireAuth);
  app.use("/api/automation", requirePermission("automation_scripts"));
  app.use("/api/settings", requirePermission("system_settings"));
  app.use("/api/missions", requirePermission("mission_planning"));
  app.use("/api/waypoints", requirePermission("mission_planning"));
  app.use("/api/flight-sessions", requirePermission("access_flight_recorder"));
  app.use("/api/drones", requirePermission("view_map"));
  app.use("/api/drones", requirePermissionForWrites("system_settings"));
  app.use("/api/airspace", requirePermission("view_map"));
  app.use("/api/airspace", requirePermissionForWrites("manage_geofences"));
  app.use("/api/mapping", requirePermission("view_map"));
  app.use("/api/geocode", requirePermission("view_map"));
  app.use("/api/reverse-geocode", requirePermission("view_map"));
  app.use("/api/plugins", requirePermission("system_settings"));
  app.use("/api/backup", requirePermission("system_settings"));
  app.use("/api/drive", requirePermission("system_settings"));
  app.use("/api/google", (req: any, res: any, next: any) => {
    if (String(req.path || "") === "/callback") return next();
    return requirePermission("system_settings")(req, res, next);
  });
  app.use("/api/connections", requirePermission("system_settings"));
  app.use("/api/integrations", requirePermission("system_settings"));
  app.use("/api/cloud/config", requirePermission("system_settings"));
  app.use("/api/cloud/status", requirePermission("system_settings"));
  app.use("/api/cloud/test", requirePermission("system_settings"));
  app.use("/api/cloud/media", requirePermission("camera_control"));
  app.use("/api/cloud/awareness", requirePermission("view_map"));
  app.use("/api/cloud/telemetry/live", requirePermission("view_telemetry"));
  app.use("/api/cloud/sync-all", requirePermission("system_settings"));
  app.use("/api/cloud/admin-dashboard", requirePermission("system_settings"));
  app.use("/api/backlog", requirePermission("view_telemetry"));
  app.use("/api/commands", requireAuth);
  app.use("/api/servo", requirePermission("flight_control"));
  app.use("/api/stabilization", requirePermission("flight_control"));
  app.use("/api/camera-settings", requirePermission("camera_control"));
  app.use("/api/media", requirePermission("camera_control"));
  app.use("/api/flight-logs", requirePermission("access_flight_recorder"));
  app.use("/api/telemetry", requirePermission("view_telemetry"));
  app.use("/api/bme688", requirePermission("view_telemetry"));
  app.use("/api/motor-telemetry", requirePermission("view_telemetry"));
  app.use("/api/sensor-data", requirePermission("view_telemetry"));
  app.use("/api/firmware", requireAuth, requirePermission("system_settings"));
  app.use("/api/runtime-config", requireAuth);

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
    void syncCloudDocument("audio_bridge_sessions", updated.sessionId, updated, { session }).catch(logCloudErr);
    void appendCloudDocument("operator_actions", {
      action: "audio_session_join",
      mode,
      droneId,
      at: now,
    }, { session, visibility: "admin" }).catch(logCloudErr);

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
      void deleteCloudDocument("audio_bridge_sessions", id).catch(logCloudErr);
      void appendCloudDocument("operator_actions", {
        action: "audio_session_leave",
        droneId,
        at: new Date().toISOString(),
      }, { session, visibility: "admin" }).catch(logCloudErr);
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
    scheduleRuntimeStatePersist();
    res.json({ success: true, state: audioState });
  });

  app.post("/api/audio/buzzer", async (req, res) => {
    const tone = String(req.body?.tone || "alert");
    audioState.lastBuzzerTone = tone;
    scheduleRuntimeStatePersist();
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
    scheduleRuntimeStatePersist();

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
    scheduleRuntimeStatePersist();
    void syncCloudDocument("audio_state", "live", audioState.live, { session: requestSession(req), visibility: "admin" }).catch(logCloudErr);
    res.json({ success: true, live: audioState.live });
  });

  app.post("/api/audio/live/stop", async (_req, res) => {
    audioState.live = {
      active: false,
      source: audioState.live.source,
      startedAt: null,
    };
    broadcast("audio_live", { ...audioState.live });
    scheduleRuntimeStatePersist();
    void syncCloudDocument("audio_state", "live", audioState.live, { session: null, visibility: "admin" }).catch(logCloudErr);
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
    scheduleRuntimeStatePersist();
    void syncCloudDocument("audio_state", "drone_mic", audioState.droneMic, { session: requestSession(req), visibility: "admin" }).catch(logCloudErr);
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
    scheduleRuntimeStatePersist();
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
    scheduleRuntimeStatePersist();
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
    scheduleRuntimeStatePersist();
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
        const connectionString = String(
          req.body?.connectionString || req.query.connectionString || process.env.MAVLINK_CONNECTION || "",
        ).trim();

        if (!connectionString) {
          pushDebugEvent("warn", "mavlink.command", "Gimbal command rejected without MAVLink connection", {
            command,
            hardware: false,
            pitch,
            yaw,
          });
          return res.status(400).json({
            success: false,
            error: "connectionString is required for gimbal control",
            hardware: false,
            command,
            pitch,
            yaw,
          });
        }

        const bridgeResult = await runMavlinkVehicleControl([
          "action",
          "--connection",
          connectionString,
          "--action",
          "gimbal",
          "--pitch",
          String(pitch),
          "--yaw",
          String(yaw),
          "--timeout",
          "10",
        ]);
        if (!bridgeResult.ok || bridgeResult.data?.success !== true) {
          const errorMessage = bridgeResult.error || bridgeResult.data?.error || "Gimbal command failed";
          pushDebugEvent("error", "mavlink.command", "Gimbal command failed", {
            command,
            connectionString,
            pitch,
            yaw,
            error: errorMessage,
          });
          return res.status(500).json({
            success: false,
            error: errorMessage,
            hardware: true,
            command,
            pitch,
            yaw,
          });
        }
        if (bridgeResult.data?.ack == null) {
          pushDebugEvent("warn", "mavlink.command", "Gimbal command missing ACK", {
            command,
            connectionString,
            pitch,
            yaw,
          });
          return res.status(502).json({
            success: false,
            error: "Gimbal command did not receive FC ACK",
            hardware: true,
            command,
            pitch,
            yaw,
          });
        }
        pushDebugEvent("success", "mavlink.command", "Gimbal command acknowledged", {
          command,
          hardware: true,
          connectionString,
          pitch,
          yaw,
          ack: bridgeResult.data?.ack,
        });
        return res.json({
          success: true,
          command,
          pitch,
          yaw,
          ack: bridgeResult.data?.ack,
          hardware: true,
        });
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
      scheduleRuntimeStatePersist();

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
            scheduleRuntimeStatePersist();
            void appendCloudDocument("calibration_events", { mode, status: "completed", connectionString, ack: parsed.ack ?? null, timestamp: new Date().toISOString() }, { session: requestSession(req) }).catch(logCloudErr);
            return res.json({ success: true, mode, ack: parsed.ack ?? null });
          }
          calibrationState[mode].status = "failed";
          calibrationState[mode].message = parsed?.error || err || "Calibration failed";
          scheduleRuntimeStatePersist();
          return res.status(500).json({ success: false, error: calibrationState[mode].message });
        } catch {
          calibrationState[mode].status = "failed";
          calibrationState[mode].message = err || "Invalid calibration bridge response";
          scheduleRuntimeStatePersist();
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
            scheduleRuntimeStatePersist();
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

  app.post("/api/mavlink/vehicle/action", rateLimitMiddleware, async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      const action = String(req.body?.action || "").trim().toLowerCase();
      const mode = String(req.body?.mode || "").trim().toUpperCase();
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!["arm", "disarm", "set_mode", "reboot", "takeoff", "gimbal"].includes(action)) {
        return res.status(400).json({ success: false, error: "action must be arm|disarm|set_mode|reboot|takeoff|gimbal" });
      }
      if (action === "set_mode" && !mode) {
        return res.status(400).json({ success: false, error: "mode is required for set_mode" });
      }
      if (action === "takeoff") {
        const alt = Number(req.body?.altitude ?? 20);
        if (!Number.isFinite(alt) || alt <= 0) {
          return res.status(400).json({ success: false, error: "altitude must be a positive number for takeoff" });
        }
      }
      const altitude = Number(req.body?.altitude ?? 20);
      const pitch = Number(req.body?.pitch ?? -45);
      const yaw = Number(req.body?.yaw ?? 0);

      pushDebugEvent("info", "mavlink.vehicle_action", "Vehicle action dispatch requested", {
        action,
        mode: mode || null,
        connectionString,
      });
      const args = ["action", "--connection", connectionString, "--action", action, "--timeout", "8"];
      if (mode) args.push("--mode", mode);
      if (action === "takeoff" && Number.isFinite(altitude)) args.push("--altitude", String(altitude));
      if (action === "gimbal") {
        args.push("--pitch", String(pitch), "--yaw", String(yaw));
      }
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
      void publishCloudRealtime("vehicle_command", { connectionString, action, mode: mode || null, result: result.data }).catch(logCloudErr);
      void appendCloudDocument("vehicle_commands", { connectionString, action, mode: mode || null, result: result.data, timestamp: new Date().toISOString() }, { session: requestSession(req) }).catch(logCloudErr);
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
      void publishCloudRealtime("manual_control", { connectionString, x: Number(x), y: Number(y), z: Number(z), r: Number(r) }).catch(logCloudErr);
      res.json({ success: true, result: result.data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Manual control failed" });
    }
  });

  app.post("/api/commands/dispatch", rateLimitMiddleware, async (req: any, res) => {
    try {
      const session = req.serverSession as ServerSession | undefined;
      if (!session) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }

      const rawType = String(req.body?.commandType || req.body?.type || "").trim().toLowerCase();
      const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
      if (req.body?.command && !payload.command) {
        (payload as any).command = String(req.body.command);
      }
      const resolved = resolveUnifiedCommand(rawType, payload);
      if (!resolved) {
        return res.status(400).json({
          success: false,
          error: "Unsupported command. This command is disabled until a safe backend implementation is available.",
        });
      }

      const requiredPermission = commandPermissionForType(rawType || resolved.type);
      if (!hasServerPermission(session, requiredPermission)) {
        return res.status(403).json({ success: false, error: "Insufficient permissions for this command" });
      }

      const connectionString = String(req.body?.connectionString || payload.connectionString || "").trim();

      const record = await commandService.dispatchAndWait(
        {
          type: resolved.type,
          payload: {
            ...resolved.payload,
            connectionString,
          },
          timeoutMs: Number(req.body?.timeoutMs || 12000),
          requestedBy: {
            userId: session.userId,
            role: session.role,
            name: session.name,
          },
        },
        async () =>
          executeUnifiedCommand({
            type: resolved.type,
            payload: resolved.payload,
            connectionString,
          }),
      );

      if (record.status === "acked") {
        void publishCloudRealtime("command_acked", record, { session }).catch(logCloudErr);
      } else {
        void publishCloudRealtime("command_failed", record, { session }).catch(logCloudErr);
      }
      void appendCloudDocument("command_history", record, { session }).catch(logCloudErr);

      return res.json({ success: record.status === "acked", command: record });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Command dispatch failed" });
    }
  });

  app.get("/api/commands", async (req, res) => {
    const session = (req as any).serverSession as ServerSession | undefined;
    if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
    const canRead =
      hasServerPermission(session, "flight_control") ||
      hasServerPermission(session, "run_terminal") ||
      hasServerPermission(session, "arm_disarm");
    if (!canRead) return res.status(403).json({ success: false, error: "Insufficient permissions" });
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    return res.json({ success: true, commands: commandService.list(limit) });
  });

  app.get("/api/commands/:id", async (req, res) => {
    const session = (req as any).serverSession as ServerSession | undefined;
    if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
    const canRead =
      hasServerPermission(session, "flight_control") ||
      hasServerPermission(session, "run_terminal") ||
      hasServerPermission(session, "arm_disarm");
    if (!canRead) return res.status(403).json({ success: false, error: "Insufficient permissions" });
    const command = commandService.get(String(req.params.id || "").trim());
    if (!command) return res.status(404).json({ success: false, error: "Command not found" });
    return res.json({ success: true, command });
  });

  const loadMissionStaticRestrictionZones = async (includePartTime: boolean) => {
    const parseTimestamp = (value: unknown): Date | null => {
      const text = String(value || "").trim();
      if (!text) return null;
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const isPartTimeFeatureActive = (props: Record<string, unknown>, now: Date) => {
      const activeAt =
        parseTimestamp(props.ACTIVETIME) ||
        parseTimestamp(props.activeTime) ||
        parseTimestamp(props.ALERTTIME) ||
        parseTimestamp(props.alertTime);
      const endAt =
        parseTimestamp(props.ENDTIME) ||
        parseTimestamp(props.endTime);
      return (!activeAt || activeAt <= now) && (!endAt || endAt >= now);
    };

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
    if (includePartTime) {
      files.push({
        key: "part_time",
        file: "Part_Time_National_Security_UAS_Flight_Restrictions.geojson",
        label: "Part-Time Security Restriction",
      });
    }

    const zones: AirspaceZone[] = [];
    for (const entry of files) {
      if (entry.key === "part_time") {
        const fullPath = path.resolve(process.cwd(), "client", "public", "airspace", entry.file);
        const raw = JSON.parse(await readFile(fullPath, "utf-8"));
        const features = Array.isArray(raw?.features) ? raw.features : [];
        const now = new Date();
        const filtered = {
          ...raw,
          features: features.filter((feature: any) => {
            const props = feature?.properties && typeof feature.properties === "object"
              ? (feature.properties as Record<string, unknown>)
              : {};
            return isPartTimeFeatureActive(props, now);
          }),
        };
        zones.push(...normalizeStaticGeoJsonToZones(filtered, entry.label));
        continue;
      }

      let cached = staticAirspaceCache.get(entry.key);
      if (!cached) {
        const fullPath = path.resolve(process.cwd(), "client", "public", "airspace", entry.file);
        const raw = JSON.parse(await readFile(fullPath, "utf-8"));
        cached = normalizeStaticGeoJsonToZones(raw, entry.label);
        staticAirspaceCache.set(entry.key, cached);
      }
      zones.push(...(cached as AirspaceZone[]));
    }
    return zones;
  };

  const fetchMissionLiveRestrictionZones = async (bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }) => {
    const apiKey = process.env.OPENAIP_API_KEY;
    if (!apiKey) return [] as AirspaceZone[];
    const apiBase = (process.env.OPENAIP_BASE_URL || "https://api.core.openaip.net/api").replace(/\/+$/, "");
    const providerUrl = new URL(`${apiBase}/airspaces`);
    providerUrl.searchParams.set("bbox", `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
    providerUrl.searchParams.set("limit", "250");
    const providerResp = await fetch(providerUrl.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "MOUSE-GCS/1.0 (Ground Control Station)",
        "x-openaip-api-key": apiKey,
        apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!providerResp.ok) return [] as AirspaceZone[];
    const raw = await providerResp.json();
    return normalizeRestrictedZonesFromProvider(raw);
  };

  const estimateMissionDurationSec = (wps: Array<{ latitude: number; longitude: number; altitude: number }>) => {
    if (wps.length < 2) return 90;
    let totalDistance = 0;
    for (let i = 0; i < wps.length - 1; i++) {
      totalDistance += haversineDistanceMeters(
        { lat: Number(wps[i].latitude), lng: Number(wps[i].longitude) },
        { lat: Number(wps[i + 1].latitude), lng: Number(wps[i + 1].longitude) },
      );
    }
    const cruiseMps = 8;
    const segmentPenaltySec = wps.length * 8;
    return Math.max(60, Math.min(4 * 60 * 60, Math.round(totalDistance / cruiseMps + segmentPenaltySec)));
  };

  app.post("/api/missions/:id/execute", async (req: any, res) => {
    try {
      const session = req.serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ success: false, error: "Authentication required" });

      const missionId = String(req.params.id || "").trim();
      const connectionString = String(req.body?.connectionString || "").trim();
      const armBeforeStart = req.body?.armBeforeStart === true;
      if (!missionId) return res.status(400).json({ success: false, error: "mission id is required" });
      if (!connectionString) return res.status(400).json({ success: false, error: "connectionString is required" });

      const mission = await storage.getMission(missionId);
      if (!mission) return res.status(404).json({ success: false, error: "Mission not found" });
      const waypoints = (await storage.getWaypointsByMission(missionId)).sort((a, b) => a.order - b.order);
      if (!waypoints.length) return res.status(400).json({ success: false, error: "Mission has no waypoints" });

      const validationErrors: string[] = [];
      waypoints.forEach((wp, idx) => {
        const n = idx + 1;
        if (!Number.isFinite(Number(wp.latitude)) || Number(wp.latitude) < -90 || Number(wp.latitude) > 90) {
          validationErrors.push(`WP ${n}: invalid latitude`);
        }
        if (!Number.isFinite(Number(wp.longitude)) || Number(wp.longitude) < -180 || Number(wp.longitude) > 180) {
          validationErrors.push(`WP ${n}: invalid longitude`);
        }
        if (!Number.isFinite(Number(wp.altitude)) || Number(wp.altitude) < 0 || Number(wp.altitude) > 500) {
          validationErrors.push(`WP ${n}: altitude must be 0..500m`);
        }
      });
      if (validationErrors.length) {
        return res.status(400).json({ success: false, error: "Mission validation failed", validationErrors });
      }

      const routePolicy = req.body?.routePolicy && typeof req.body.routePolicy === "object" ? req.body.routePolicy : {};
      const overrideNoFlyRestrictions = routePolicy.overrideNoFlyRestrictions === true;

      const routeBbox = waypoints.reduce(
        (acc, wp) => ({
          minLat: Math.min(acc.minLat, Number(wp.latitude)),
          minLng: Math.min(acc.minLng, Number(wp.longitude)),
          maxLat: Math.max(acc.maxLat, Number(wp.latitude)),
          maxLng: Math.max(acc.maxLng, Number(wp.longitude)),
        }),
        {
          minLat: Number.POSITIVE_INFINITY,
          minLng: Number.POSITIVE_INFINITY,
          maxLat: Number.NEGATIVE_INFINITY,
          maxLng: Number.NEGATIVE_INFINITY,
        },
      );
      const expandedBbox = {
        minLng: routeBbox.minLng - 0.01,
        minLat: routeBbox.minLat - 0.01,
        maxLng: routeBbox.maxLng + 0.01,
        maxLat: routeBbox.maxLat + 0.01,
      };

      const staticZones = await loadMissionStaticRestrictionZones(true);
      const liveZones = await fetchMissionLiveRestrictionZones(expandedBbox);
      const effectiveRestrictedZones = [...staticZones, ...liveZones];
      const blockers = missionSegmentsIntersectZones(waypoints, effectiveRestrictedZones);
      if (blockers.length > 0 && !overrideNoFlyRestrictions) {
        return res.status(409).json({
          success: false,
          error: "Mission route intersects restricted/no-fly airspace",
          blockedBy: blockers.slice(0, 10).map((z) => ({ id: z.id, name: z.name, type: z.type })),
          routePolicyRequired: {
            overrideNoFlyRestrictions: true,
          },
        });
      }
      if (blockers.length > 0 && overrideNoFlyRestrictions) {
        const overrideReason = String(routePolicy.overrideReason || "").trim();
        try {
          const auditDir = path.join(process.cwd(), "data");
          await mkdir(auditDir, { recursive: true });
          const auditLine = JSON.stringify({
            type: "no_fly_override",
            missionId,
            userId: session.userId,
            userName: session.name,
            role: session.role,
            reason: overrideReason.slice(0, 500) || "operator_override",
            blockedCount: blockers.length,
            at: new Date().toISOString(),
          }) + "\n";
          await appendFile(path.join(auditDir, "audit_no_fly_override.jsonl"), auditLine);
        } catch (auditErr: any) {
          console.error("Audit log write failed:", auditErr);
        }
      }

      const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
      const run: MissionRunRecord = {
        id: runId,
        missionId,
        status: "uploading",
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        connectionString,
        commandIds: [],
        expectedCompletionAt: null,
        completedAt: null,
        completionSource: undefined,
      };
      setMissionRunRecord(runId, run);
      broadcast("mission_execution_update", run);

      const uploadResult = await runMissionUploadBridge(
        connectionString,
        waypoints.map((wp) => ({
          order: wp.order,
          lat: wp.latitude,
          lng: wp.longitude,
          altitude: wp.altitude,
          action: wp.action || "flythrough",
          actionParams: wp.actionParams || {},
        })),
      );
      if (!uploadResult.ok) {
        run.status = "failed";
        run.error = uploadResult.error || "Mission upload failed";
        run.updatedAt = new Date().toISOString();
        setMissionRunRecord(runId, run);
        broadcast("mission_execution_update", run);
        return res.status(500).json({ success: false, run });
      }

      if (armBeforeStart) {
        run.status = "arming";
        run.updatedAt = new Date().toISOString();
        setMissionRunRecord(runId, run);
        broadcast("mission_execution_update", run);
        const armRecord = await commandService.dispatchAndWait(
          {
            type: "arm",
            payload: { connectionString },
            requestedBy: { userId: session.userId, role: session.role, name: session.name },
            timeoutMs: 12000,
          },
          async () => executeUnifiedCommand({ type: "arm", payload: {}, connectionString }),
        );
        run.commandIds.push(armRecord.id);
        if (armRecord.status !== "acked") {
          run.status = "failed";
          run.error = armRecord.error || "Failed to arm before mission start";
          run.updatedAt = new Date().toISOString();
          setMissionRunRecord(runId, run);
          broadcast("mission_execution_update", run);
          return res.status(500).json({ success: false, run, armCommand: armRecord });
        }
      }

      run.status = "starting";
      run.updatedAt = new Date().toISOString();
      setMissionRunRecord(runId, run);
      broadcast("mission_execution_update", run);
      const startRecord = await commandService.dispatchAndWait(
        {
          type: "mission_start",
          payload: { connectionString },
          requestedBy: { userId: session.userId, role: session.role, name: session.name },
          timeoutMs: 12000,
        },
        async () => executeUnifiedCommand({ type: "mission_start", payload: {}, connectionString }),
      );
      run.commandIds.push(startRecord.id);
      if (startRecord.status !== "acked") {
        run.status = "failed";
        run.error = startRecord.error || "Failed to start mission";
        run.updatedAt = new Date().toISOString();
        setMissionRunRecord(runId, run);
        broadcast("mission_execution_update", run);
        return res.status(500).json({ success: false, run, startCommand: startRecord });
      }

      run.status = "running";
      run.updatedAt = new Date().toISOString();
      run.expectedCompletionAt = new Date(Date.now() + estimateMissionDurationSec(waypoints) * 1000).toISOString();
      run.waypointCount = waypoints.length;
      run.currentWaypointIndex = null;
      run.progressUpdatedAt = null;
      setMissionRunRecord(runId, run);
      broadcast("mission_execution_update", run);
      startMissionRunProgressMonitor(runId);
      void appendCloudDocument("mission_runs", run, { session }).catch(logCloudErr);
      return res.json({ success: true, run });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Mission execution failed" });
    }
  });

  app.get("/api/missions/runs/:runId", async (req, res) => {
    const run = missionRuns.get(String(req.params.runId || "").trim());
    if (!run) return res.status(404).json({ success: false, error: "Mission run not found" });
    return res.json({ success: true, run });
  });

  app.post("/api/missions/runs/:runId/stop", async (req: any, res) => {
    try {
      const session = req.serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
      const run = missionRuns.get(String(req.params.runId || "").trim());
      if (!run) return res.status(404).json({ success: false, error: "Mission run not found" });

      const stopRecord = await commandService.dispatchAndWait(
        {
          type: "mission_stop",
          payload: { connectionString: run.connectionString },
          requestedBy: { userId: session.userId, role: session.role, name: session.name },
          timeoutMs: 12000,
        },
        async () => executeUnifiedCommand({ type: "mission_stop", payload: {}, connectionString: run.connectionString }),
      );
      run.commandIds.push(stopRecord.id);
      run.status = stopRecord.status === "acked" ? "stopped" : "failed";
      run.error = stopRecord.status === "acked" ? null : stopRecord.error || "Failed to stop mission";
      run.updatedAt = new Date().toISOString();
      stopMissionRunProgressMonitor(run.id);
      setMissionRunRecord(run.id, run);
      broadcast("mission_execution_update", run);
      return res.json({ success: stopRecord.status === "acked", run, stopCommand: stopRecord });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Mission stop failed" });
    }
  });

  app.post("/api/missions/runs/:runId/complete", async (req: any, res) => {
    try {
      const session = req.serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ success: false, error: "Authentication required" });
      const run = missionRuns.get(String(req.params.runId || "").trim());
      if (!run) return res.status(404).json({ success: false, error: "Mission run not found" });
      if (run.status !== "running") {
        return res.status(409).json({ success: false, error: `Mission run is in '${run.status}' state` });
      }
      await markMissionRunCompleted(run, "explicit_signal", session);
      return res.json({ success: true, run });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Mission completion update failed" });
    }
  });

  const resolveAutomationCommand = (
    trigger: string,
    code: string,
  ): { type: string; payload: Record<string, unknown>; reason: string } | null => {
    const normalizedCode = String(code || "");
    const triggerValue = String(trigger || "").trim().toLowerCase();

    const takeoffMatch = normalizedCode.match(/takeoff\s*\(\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (takeoffMatch) {
      const altitude = Number(takeoffMatch[1]);
      return {
        type: "takeoff",
        payload: { altitude: Number.isFinite(altitude) ? altitude : 20 },
        reason: "Detected takeoff command in script",
      };
    }
    if (/returnToBase|return to base|\brtl\b/i.test(normalizedCode)) {
      return { type: "rtl", payload: {}, reason: "Detected return-to-launch command in script" };
    }
    if (/\bland\b/i.test(normalizedCode)) {
      return { type: "land", payload: {}, reason: "Detected land command in script" };
    }
    if (/\bdisarm\b/i.test(normalizedCode)) {
      return { type: "disarm", payload: {}, reason: "Detected disarm command in script" };
    }
    if (/\barm\b/i.test(normalizedCode)) {
      return { type: "arm", payload: {}, reason: "Detected arm command in script" };
    }

    if (triggerValue === "battery_low" || triggerValue === "gps_lost" || triggerValue === "disconnect") {
      return { type: "rtl", payload: {}, reason: `Mapped ${triggerValue} trigger to RTL failsafe` };
    }
    if (triggerValue === "landing") {
      return { type: "land", payload: {}, reason: "Mapped landing trigger to LAND command" };
    }
    if (triggerValue === "takeoff") {
      return { type: "takeoff", payload: { altitude: 20 }, reason: "Mapped takeoff trigger to TAKEOFF command" };
    }

    return null;
  };

  app.post("/api/automation/scripts/execute", async (req: any, res) => {
    try {
      const session = req.serverSession as ServerSession | undefined;
      if (!session) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }

      const scriptId = String(req.body?.scriptId || "").trim();
      const scriptName = String(req.body?.scriptName || req.body?.name || "").trim();
      const trigger = String(req.body?.trigger || "manual").trim().toLowerCase();
      const reason = String(req.body?.reason || "Manual run").trim();
      const code = String(req.body?.code || "").trim();
      const connectionString = String(req.body?.connectionString || "").trim();

      if (!scriptId) return res.status(400).json({ success: false, error: "scriptId is required" });
      if (!scriptName) return res.status(400).json({ success: false, error: "scriptName is required" });

      const now = new Date().toISOString();
      const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
      const run: AutomationRunRecord = {
        id: runId,
        scriptId,
        scriptName,
        trigger,
        reason,
        status: "queued",
        error: null,
        result: null,
        createdAt: now,
        updatedAt: now,
        commandId: null,
        requestedBy: {
          userId: session.userId,
          role: session.role,
          name: session.name,
        },
      };
      automationRuns.set(runId, run);
      if (automationRuns.size > 1000) {
        const oldest = automationRuns.keys().next().value;
        if (oldest) automationRuns.delete(oldest);
      }
      scheduleRuntimeStatePersist();

      const planned = resolveAutomationCommand(trigger, code);
      if (!planned) {
        run.status = "failed";
        run.error = "Script has no safe executable backend command mapping";
        run.updatedAt = new Date().toISOString();
        automationRuns.set(runId, run);
        scheduleRuntimeStatePersist();
        broadcast("automation_run_update", run);
        return res.status(400).json({ success: false, run, error: run.error });
      }

      const requiredPermission = commandPermissionForType(planned.type);
      if (!hasServerPermission(session, requiredPermission)) {
        run.status = "failed";
        run.error = `Insufficient permissions: ${requiredPermission} required`;
        run.updatedAt = new Date().toISOString();
        automationRuns.set(runId, run);
        scheduleRuntimeStatePersist();
        broadcast("automation_run_update", run);
        return res.status(403).json({ success: false, run, error: run.error });
      }

      run.status = "running";
      run.updatedAt = new Date().toISOString();
      automationRuns.set(runId, run);
      scheduleRuntimeStatePersist();
      broadcast("automation_run_update", run);

      const commandRecord = await commandService.dispatchAndWait(
        {
          type: planned.type,
          payload: { ...planned.payload, connectionString },
          requestedBy: { userId: session.userId, role: session.role, name: session.name },
          timeoutMs: 15000,
        },
        async () =>
          executeUnifiedCommand({
            type: planned.type,
            payload: planned.payload,
            connectionString,
          }),
      );

      run.commandId = commandRecord.id;
      run.result = {
        commandType: planned.type,
        commandStatus: commandRecord.status,
        dispatchReason: planned.reason,
      };
      if (commandRecord.status === "acked") {
        run.status = "completed";
        run.error = null;
      } else {
        run.status = "failed";
        run.error = commandRecord.error || "Automation command failed";
      }
      run.updatedAt = new Date().toISOString();
      automationRuns.set(runId, run);
      scheduleRuntimeStatePersist();
      broadcast("automation_run_update", run);
      void appendCloudDocument("automation_runs", run, { session }).catch(logCloudErr);

      return res.json({
        success: run.status === "completed",
        run,
        command: commandRecord,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Automation execution failed" });
    }
  });

  app.get("/api/automation/runs", async (req, res) => {
    const scriptId = String(req.query.scriptId || "").trim();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    const all = Array.from(automationRuns.values()).reverse();
    const filtered = scriptId ? all.filter((run) => run.scriptId === scriptId) : all;
    return res.json({ success: true, runs: filtered.slice(0, limit) });
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
      void appendCloudDocument("swarm_actions", payload, { session: requestSession(req) }).catch(logCloudErr);
      void publishCloudRealtime("swarm_action", payload).catch(logCloudErr);
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
      void appendCloudDocument("swarm_actions", payload, { session: requestSession(req) }).catch(logCloudErr);
      void publishCloudRealtime("swarm_sync_action", payload).catch(logCloudErr);
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
      void appendCloudDocument("swarm_formation_missions", payload, { session: requestSession(req) }).catch(logCloudErr);
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
      const portRaw = String(req.body?.port || "").trim();
      const commandRaw = String(req.body?.command || "ATI").trim();
      if (!portRaw) return res.status(400).json({ success: false, error: "port is required" });
      const port = allowlistShellArg(portRaw, "port");
      const command = allowlistShellArg(commandRaw.replace(/'/g, ""), "cmd");
      const template = process.env.MOUSE_SIK_AT_CMD || "";
      if (!template.trim()) {
        return res.status(503).json({
          success: false,
          error: "MOUSE_SIK_AT_CMD is not configured",
          example: "python3 /opt/mouse/tools/sik_at.py --port {port} --cmd '{cmd}'",
        });
      }
      const cmd = template.replace(/\{port\}/g, port).replace(/\{cmd\}/g, command);
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
      const portRaw = String(req.body?.port || "").trim();
      const profileId = String(req.body?.profileId || "").trim();
      if (!portRaw || !profileId) return res.status(400).json({ success: false, error: "port and profileId are required" });
      const port = allowlistShellArg(portRaw, "port");
      const template = process.env.MOUSE_SIK_AT_CMD || "";
      if (!template.trim()) return res.status(503).json({ success: false, error: "MOUSE_SIK_AT_CMD is not configured" });
      const cmds = SIK_MODEM_PROFILES[profileId];
      if (!cmds) return res.status(404).json({ success: false, error: "modem profile not found" });

      const results: Array<{ command: string; success: boolean; stdout: string; stderr: string; code: number | null }> = [];
      for (const c of cmds) {
        const cmdSafe = allowlistShellArg(String(c || "").replace(/'/g, ""), "cmd");
        const cmd = template.replace(/\{port\}/g, port).replace(/\{cmd\}/g, cmdSafe);
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
      const connectionStringRaw = String(req.body?.connectionString || "").trim();
      const localPort = Number(req.body?.localPort || 5760);
      if (!connectionStringRaw) return res.status(400).json({ success: false, error: "connectionString is required" });
      if (!Number.isFinite(localPort) || localPort < 1 || localPort > 65535) {
        return res.status(400).json({ success: false, error: "localPort must be 1..65535" });
      }
      const connectionString = allowlistShellArg(connectionStringRaw, "conn");
      const portStr = allowlistShellArg(String(localPort), "port");

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
        .replace(/\{port\}/g, portStr);
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
      scheduleRuntimeStatePersist();

      child.on("exit", () => {
        serialPassthroughProcess = null;
        serialPassthroughState.running = false;
        serialPassthroughState.message = "Stopped";
        scheduleRuntimeStatePersist();
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
      scheduleRuntimeStatePersist();
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
    try {
      host = allowlistShellArg(host, "host");
      mountpoint = allowlistShellArg(mountpoint, "mount");
      username = allowlistShellArg(username, "user");
      password = allowlistShellArg(password, "pass");
      connectionString = allowlistShellArg(connectionString, "conn");
    } catch (e: any) {
      return { ok: false, error: e?.message || "Invalid parameter" };
    }
    const portStr = allowlistShellArg(String(port), "port");
    const cmd = template
      .replace(/\{host\}/g, host)
      .replace(/\{port\}/g, portStr)
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
    scheduleRuntimeStatePersist();
    child.on("exit", () => {
      rtkNtripProcess = null;
      rtkNtripState.running = false;
      rtkNtripState.message = "Stopped";
      scheduleRuntimeStatePersist();
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
      scheduleRuntimeStatePersist();

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

      const hostSafe = allowlistShellArg(host, "host");
      const mountSafe = allowlistShellArg(mountpoint, "mount");
      const userSafe = allowlistShellArg(username, "user");
      const passSafe = allowlistShellArg(password, "pass");
      const connSafe = allowlistShellArg(connectionString, "conn");
      const portStr = allowlistShellArg(String(port), "port");

      const template = process.env.MOUSE_GPS_INJECT_CMD || "";
      if (!template.trim()) {
        return res.status(503).json({
          success: false,
          error: "MOUSE_GPS_INJECT_CMD is not configured",
          example: "str2str -in ntrip://{user}:{pass}@{host}:{port}/{mount} -out serial://{conn}",
        });
      }

      const cmd = template
        .replace(/\{host\}/g, hostSafe)
        .replace(/\{port\}/g, portStr)
        .replace(/\{mount\}/g, mountSafe)
        .replace(/\{user\}/g, userSafe)
        .replace(/\{pass\}/g, passSafe)
        .replace(/\{conn\}/g, connSafe);
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
      scheduleRuntimeStatePersist();

      child.on("exit", () => {
        gpsInjectProcess = null;
        gpsInjectState.running = false;
        gpsInjectState.message = "Stopped";
        scheduleRuntimeStatePersist();
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
      scheduleRuntimeStatePersist();
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
      scheduleRuntimeStatePersist();
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
      scheduleRuntimeStatePersist();

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
            scheduleRuntimeStatePersist();
            return;
          }
          firmwareState.busy = false;
          firmwareState.status = "failed";
          firmwareState.message = parsed?.error || err || "Firmware upload failed";
          firmwareState.progress = 0;
          scheduleRuntimeStatePersist();
        } catch {
          firmwareState.busy = false;
          firmwareState.status = "failed";
          firmwareState.message = err || "Firmware upload failed";
          firmwareState.progress = 0;
          scheduleRuntimeStatePersist();
        }
      });

      res.json({ success: true, started: true });
    } catch (error: any) {
      firmwareState.busy = false;
      firmwareState.status = "failed";
      firmwareState.message = error?.message || "Firmware upload failed";
      firmwareState.progress = 0;
      scheduleRuntimeStatePersist();
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
      scheduleRuntimeStatePersist();

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
            scheduleRuntimeStatePersist();
            return;
          }
          firmwareState.busy = false;
          firmwareState.progress = 0;
          firmwareState.status = "failed";
          firmwareState.message = parsed?.error || err || "Bootloader recovery failed";
          scheduleRuntimeStatePersist();
        } catch {
          firmwareState.busy = false;
          firmwareState.progress = 0;
          firmwareState.status = "failed";
          firmwareState.message = err || "Bootloader recovery failed";
          scheduleRuntimeStatePersist();
        }
      });
      res.json({ success: true, started: true });
    } catch (error: any) {
      firmwareState.busy = false;
      firmwareState.progress = 0;
      firmwareState.status = "failed";
      firmwareState.message = error?.message || "Bootloader recovery failed";
      scheduleRuntimeStatePersist();
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
      const id = normalizePluginId(req.params.id);
      const enabled = req.body?.enabled !== false;
      const state = await readPluginState();
      state[id] = { enabled };
      await writePluginState(state);
      res.json({ success: true, id, enabled });
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("invalid plugin id")) {
        return res.status(400).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error?.message || "Failed to update plugin state" });
    }
  });

  app.post("/api/plugins/:id/run-tool", async (req, res) => {
    try {
      const id = normalizePluginId(req.params.id);
      const toolId = String(req.body?.toolId || "").trim();
      const userArgs = req.body?.args ?? [];
      const state = await readPluginState();
      if (state[id] && state[id].enabled === false) {
        return res.status(403).json({ success: false, error: "Plugin is disabled" });
      }

      const pluginDir = path.resolve(PLUGINS_DIR, id);
      if (!pluginDir.startsWith(`${path.resolve(PLUGINS_DIR)}${path.sep}`)) {
        return res.status(400).json({ success: false, error: "Invalid plugin path" });
      }

      const manifestPath = path.join(pluginDir, "plugin.json");
      if (!existsSync(manifestPath)) return res.status(404).json({ success: false, error: "Plugin not found" });
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
      const tool = tools.find((t: any) => String(t?.id || "") === toolId);
      if (!tool || !String(tool.exec || tool.command || "").trim()) {
        return res.status(404).json({ success: false, error: "Tool not found in plugin manifest" });
      }

      const spawnSpec = buildPluginToolSpawnSpec({
        pluginsDir: PLUGINS_DIR,
        pluginId: id,
        tool,
        userArgs,
      });

      const proc = spawn(spawnSpec.command, spawnSpec.args, {
        cwd: spawnSpec.cwd,
        env: process.env,
        shell: false,
      });
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
      const msg = String(error?.message || "");
      if (
        msg.toLowerCase().includes("invalid plugin id") ||
        msg.toLowerCase().includes("path escapes plugin directory") ||
        msg.toLowerCase().includes("legacy shell command tools are disabled") ||
        msg.toLowerCase().includes("allowlisted")
      ) {
        return res.status(400).json({ success: false, error: msg });
      }
      res.status(500).json({ success: false, error: error?.message || "Failed to run plugin tool" });
    }
  });

  app.post("/api/plugins/sdk/create-template", async (req, res) => {
    try {
      const id = normalizePluginId(String(req.body?.id || "").trim().toLowerCase());
      const name = String(req.body?.name || "").trim();
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
            exec: "bash",
            args: ["tools/hello.sh"],
            allowUserArgs: false,
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
        await chmod(path.join(toolsDir, "hello.sh"), 0o755);
      } catch {
        // best effort
      }
      res.json({ success: true, id, pluginDir });
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("invalid plugin id")) {
        return res.status(400).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error?.message || "Failed to create plugin template" });
    }
  });

  app.post("/api/plugins/sdk/validate", async (req, res) => {
    try {
      const id = normalizePluginId(req.body?.id);
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
        const exec = String(tool?.exec || "").trim();
        if (!tid) errors.push("tool id missing");
        if (!exec) errors.push(`tool ${tid || "<unknown>"} missing exec`);
      }
      res.json({ success: errors.length === 0, id, errors, warnings, toolCount: tools.length });
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("invalid plugin id")) {
        return res.status(400).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error?.message || "Plugin validation failed" });
    }
  });

  app.post("/api/plugins/sdk/package", async (req, res) => {
    try {
      const id = normalizePluginId(req.body?.id);
      if (!id) return res.status(400).json({ success: false, error: "id is required" });
      const pluginDir = path.join(PLUGINS_DIR, id);
      if (!existsSync(pluginDir)) return res.status(404).json({ success: false, error: "plugin not found" });
      const outDir = path.resolve(process.cwd(), "data", "plugins");
      mkdirSync(outDir, { recursive: true });
      const archivePath = path.join(outDir, `${id}-${Date.now()}.tar.gz`);
      const proc = spawn("tar", ["-czf", archivePath, "-C", PLUGINS_DIR, id], {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
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
      if (String(error?.message || "").toLowerCase().includes("invalid plugin id")) {
        return res.status(400).json({ success: false, error: error.message });
      }
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

  // Authentication: Create server-side session from server-validated credentials.
  app.post("/api/auth/login", async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      if (!username || !password) {
        return res.status(400).json({ success: false, error: "username and password are required" });
      }

      const authenticated = authenticateWithPassword(username, password);
      if (!authenticated) {
        return res.status(401).json({ success: false, error: "Invalid username or password" });
      }

      const sessionToken = generateSessionToken();
      await setSession(sessionToken, {
        userId: authenticated.id,
        role: authenticated.role,
        name: authenticated.fullName || authenticated.username,
        createdAt: Date.now(),
      });

      void appendCloudDocument("operator_actions", {
        action: "login",
        userId: authenticated.id,
        username: authenticated.username,
        role: authenticated.role,
        at: new Date().toISOString(),
      }, {
        session: { userId: authenticated.id, role: authenticated.role, name: authenticated.fullName || authenticated.username },
        visibility: "admin",
      }).catch(logCloudErr);

      console.log(`User ${authenticated.fullName} (${authenticated.id}) logged in with role: ${authenticated.role}`);

      res.json({
        success: true,
        sessionToken,
        user: authenticated,
        message: "Login successful",
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/session", requireAuth, async (req: any, res) => {
    const session = req.serverSession as ServerSession;
    if (!session) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const fullUser = getAuthenticatedUserById(session.userId);
    if (!fullUser) {
      return res.status(401).json({ success: false, error: "Session user no longer exists" });
    }
    return res.json({
      success: true,
      user: fullUser,
      permissions: ROLE_PERMISSIONS[String(fullUser.role || "viewer").toLowerCase()] || [],
      session: {
        userId: session.userId,
        role: session.role,
        name: session.name,
      },
    });
  });

  // Authentication: Logout - invalidate session
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      const session = validateSession(sessionToken);
      if (sessionToken) {
        await deleteSession(sessionToken);
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
        }).catch(logCloudErr);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  });

  app.get("/api/admin/users", requirePermission("user_management"), async (_req, res) => {
    try {
      const users = listAuthUsers();
      return res.json({ success: true, users });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Failed to list users" });
    }
  });

  app.post("/api/admin/users", requirePermission("user_management"), async (req: any, res) => {
    try {
      const username = String(req.body?.username || "").trim();
      const fullName = String(req.body?.fullName || "").trim();
      const password = String(req.body?.password || "");
      const role = String(req.body?.role || "viewer").trim().toLowerCase();
      const enabled = req.body?.enabled !== false;
      const user = createAuthUser({ username, fullName, password, role, enabled });
      return res.json({ success: true, user });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", requirePermission("user_management"), async (req: any, res) => {
    try {
      const targetUserId = String(req.params.id || "").trim();
      if (!targetUserId) return res.status(400).json({ success: false, error: "user id is required" });
      const session = req.serverSession as ServerSession | undefined;
      if (session && targetUserId === session.userId && req.body?.enabled === false) {
        return res.status(400).json({ success: false, error: "You cannot disable your own account" });
      }

      const user = updateAuthUser(targetUserId, {
        username: req.body?.username != null ? String(req.body.username) : undefined,
        fullName: req.body?.fullName != null ? String(req.body.fullName) : undefined,
        role: req.body?.role != null ? String(req.body.role) : undefined,
        enabled: req.body?.enabled != null ? Boolean(req.body.enabled) : undefined,
      });

      if (!user.enabled) {
        revokeUserSessionsStore(user.id);
      } else {
        refreshUserSessionsStore(user.id, { role: user.role, name: user.fullName || user.username });
      }
      return res.json({ success: true, user });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to update user" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requirePermission("user_management"), async (req: any, res) => {
    try {
      const targetUserId = String(req.params.id || "").trim();
      const password = String(req.body?.password || "");
      if (!targetUserId) return res.status(400).json({ success: false, error: "user id is required" });
      const user = resetAuthUserPassword(targetUserId, password);
      return res.json({ success: true, user });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to reset password" });
    }
  });

  app.delete("/api/admin/users/:id", requirePermission("user_management"), async (req: any, res) => {
    try {
      const targetUserId = String(req.params.id || "").trim();
      const session = req.serverSession as ServerSession | undefined;
      if (!targetUserId) return res.status(400).json({ success: false, error: "user id is required" });
      if (session && targetUserId === session.userId) {
        return res.status(400).json({ success: false, error: "You cannot delete your own account" });
      }
      deleteAuthUser(targetUserId);
      revokeUserSessionsStore(targetUserId);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to delete user" });
    }
  });

  type AdminUserGroup = {
    id: string;
    name: string;
    memberIds: string[];
    defaultRole?: "admin" | "operator" | "viewer";
    createdAt: string;
    createdBy: string;
  };

  const ADMIN_GROUPS_SETTING_KEY = "admin_user_groups";
  const ADMIN_GROUPS_SETTING_CATEGORY = "user_access";
  const ADMIN_GROUP_ROLE_SET = new Set(["admin", "operator", "viewer"]);

  const normalizeAdminUserGroups = (value: unknown): AdminUserGroup[] => {
    if (!Array.isArray(value)) return [];
    const groups = value
      .map((entry: any) => {
        const roleRaw = String(entry?.defaultRole || "").toLowerCase();
        const defaultRole = ADMIN_GROUP_ROLE_SET.has(roleRaw)
          ? (roleRaw as AdminUserGroup["defaultRole"])
          : undefined;
        return {
          id: String(entry?.id || ""),
          name: String(entry?.name || "").trim(),
          memberIds: Array.isArray(entry?.memberIds)
            ? Array.from(
                new Set(
                  entry.memberIds
                    .map((memberId: any) => String(memberId || "").trim())
                    .filter(Boolean),
                ),
              )
            : [],
          defaultRole,
          createdAt: String(entry?.createdAt || ""),
          createdBy: String(entry?.createdBy || ""),
        } as AdminUserGroup;
      })
      .filter((entry) => entry.id && entry.name);
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  };

  const readAdminUserGroups = async (): Promise<AdminUserGroup[]> => {
    const setting = await storage.getSetting(ADMIN_GROUPS_SETTING_KEY);
    return normalizeAdminUserGroups(setting?.value);
  };

  const saveAdminUserGroups = async (groups: AdminUserGroup[]) => {
    const normalized = normalizeAdminUserGroups(groups);
    await storage.upsertSetting({
      key: ADMIN_GROUPS_SETTING_KEY,
      category: ADMIN_GROUPS_SETTING_CATEGORY,
      value: normalized,
    });
    return normalized;
  };

  app.get("/api/admin/groups", requirePermission("user_management"), async (_req, res) => {
    try {
      const groups = await readAdminUserGroups();
      return res.json({ success: true, groups });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Failed to list groups" });
    }
  });

  app.get("/api/groups", requireAuth, async (_req, res) => {
    try {
      const groups = await readAdminUserGroups();
      return res.json({ success: true, groups });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Failed to list groups" });
    }
  });

  app.post("/api/admin/groups", requirePermission("user_management"), async (req: any, res) => {
    try {
      const session = req.serverSession as ServerSession | undefined;
      const name = String(req.body?.name || "").trim();
      const memberIds: string[] = Array.isArray(req.body?.memberIds)
        ? Array.from(
            new Set(
              (req.body.memberIds as any[])
                .map((id: any) => String(id || "").trim())
                .filter((id): id is string => Boolean(id)),
            ),
          )
        : [];
      const roleRaw = String(req.body?.defaultRole || "").toLowerCase();
      const defaultRole = ADMIN_GROUP_ROLE_SET.has(roleRaw)
        ? (roleRaw as AdminUserGroup["defaultRole"])
        : undefined;

      if (!name) return res.status(400).json({ success: false, error: "Group name is required" });

      const groups = await readAdminUserGroups();
      if (groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
        return res.status(409).json({ success: false, error: "A group with this name already exists" });
      }

      const group: AdminUserGroup = {
        id: `group_${Date.now()}_${randomBytes(4).toString("hex")}`,
        name,
        memberIds,
        defaultRole,
        createdAt: new Date().toISOString(),
        createdBy: session?.userId || "system",
      };

      const nextGroups = await saveAdminUserGroups([...groups, group]);
      return res.json({ success: true, group, groups: nextGroups });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to create group" });
    }
  });

  app.patch("/api/admin/groups/:id", requirePermission("user_management"), async (req: any, res) => {
    try {
      const groupId = String(req.params.id || "").trim();
      if (!groupId) return res.status(400).json({ success: false, error: "group id is required" });

      const groups = await readAdminUserGroups();
      const idx = groups.findIndex((group) => group.id === groupId);
      if (idx < 0) return res.status(404).json({ success: false, error: "Group not found" });

      const name = req.body?.name != null ? String(req.body.name || "").trim() : groups[idx].name;
      if (!name) return res.status(400).json({ success: false, error: "Group name is required" });
      if (groups.some((group, i) => i !== idx && group.name.toLowerCase() === name.toLowerCase())) {
        return res.status(409).json({ success: false, error: "A group with this name already exists" });
      }

      const memberIds: string[] = Array.isArray(req.body?.memberIds)
        ? Array.from(
            new Set(
              (req.body.memberIds as any[])
                .map((id: any) => String(id || "").trim())
                .filter((id): id is string => Boolean(id)),
            ),
          )
        : groups[idx].memberIds;
      const roleRaw = req.body?.defaultRole != null ? String(req.body.defaultRole || "").toLowerCase() : groups[idx].defaultRole;
      const defaultRole = ADMIN_GROUP_ROLE_SET.has(String(roleRaw || ""))
        ? (String(roleRaw) as AdminUserGroup["defaultRole"])
        : undefined;

      const updated: AdminUserGroup = {
        ...groups[idx],
        name,
        memberIds,
        defaultRole,
      };
      groups[idx] = updated;
      const nextGroups = await saveAdminUserGroups(groups);
      return res.json({ success: true, group: updated, groups: nextGroups });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to update group" });
    }
  });

  app.delete("/api/admin/groups/:id", requirePermission("user_management"), async (req: any, res) => {
    try {
      const groupId = String(req.params.id || "").trim();
      if (!groupId) return res.status(400).json({ success: false, error: "group id is required" });

      const groups = await readAdminUserGroups();
      const idx = groups.findIndex((group) => group.id === groupId);
      if (idx < 0) return res.status(404).json({ success: false, error: "Group not found" });
      const [deleted] = groups.splice(idx, 1);
      const nextGroups = await saveAdminUserGroups(groups);
      return res.json({ success: true, deletedId: deleted.id, groups: nextGroups });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Failed to delete group" });
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
      void syncCloudDocument("settings", `${setting.category}:${setting.key}`, setting, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("missions", mission.id, mission, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("missions", mission.id, mission, { session: requestSession(req) }).catch(logCloudErr);
      res.json(mission);
    } catch (error) {
      res.status(500).json({ error: "Failed to update mission" });
    }
  });

  app.delete("/api/missions/:id", async (req, res) => {
    try {
      await storage.deleteMission(req.params.id);
      void deleteCloudDocument("missions", req.params.id).catch(logCloudErr);
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
      void syncCloudDocument("waypoints", waypoint.id, waypoint, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("waypoints", waypoint.id, waypoint, { session: requestSession(req) }).catch(logCloudErr);
      res.json(waypoint);
    } catch (error) {
      res.status(500).json({ error: "Failed to update waypoint" });
    }
  });

  app.delete("/api/waypoints/:id", async (req, res) => {
    try {
      await storage.deleteWaypoint(req.params.id);
      void deleteCloudDocument("waypoints", req.params.id).catch(logCloudErr);
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
      void appendCloudDocument("flight_logs", log, { session: requestSession(req) }).catch(logCloudErr);
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
      void appendCloudDocument("motor_telemetry", telemetry, { session: requestSession(req) }).catch(logCloudErr);
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
      void appendCloudDocument("sensor_data", data, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("camera_settings", "active", settings, { session: requestSession(req) }).catch(logCloudErr);
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

      let providerResp: Response;
      try {
        providerResp = await fetch(providerUrl.toString(), {
          headers: {
            "Accept": "application/json",
            "User-Agent": "MOUSE-GCS/1.0 (Ground Control Station)",
            "x-openaip-api-key": apiKey,
            "apiKey": apiKey,
          },
          signal: AbortSignal.timeout(8000),
        });
      } catch (networkErr) {
        // Offline / network-denied — return empty zones so client can operate
        console.warn("[airspace] Provider unreachable (offline):", (networkErr as Error)?.message);
        return res.json({
          provider: "openaip",
          configured: true,
          offline: true,
          bbox: bbox!,
          zones: [],
          message: "Airspace data unavailable offline; using local/cached zones only",
        });
      }

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

  // Geocoding API (proxy for Nominatim with proper headers)
  app.get("/api/geocode", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      let response: Response;
      try {
        response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
          {
            headers: {
              'User-Agent': 'MOUSE-GCS/1.0 (Ground Control Station)',
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          }
        );
      } catch (networkErr) {
        // Offline / network-denied — return empty so client can continue
        console.warn("[geocode] Nominatim unreachable (offline):", (networkErr as Error)?.message);
        return res.json([]);
      }

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
    const session = requestSession(req);
    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const result = getAuthUrl();
    if ('error' in result) {
      res.status(400).json({ error: result.error });
    } else {
      const now = Date.now();
      oauthStateStore.forEach((meta, state) => {
        if (now - meta.createdAt > 10 * 60 * 1000) {
          oauthStateStore.delete(state);
        }
      });
      oauthStateStore.set(result.state, { createdAt: now, userId: session.userId });
      res.json(result);
    }
  });

  app.get("/api/google/callback", async (req, res) => {
    const code = req.query.code as string;
    const state = String(req.query.state || "").trim();
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }
    if (!state) {
      return res.status(400).send('OAuth state missing');
    }
    const stateMeta = oauthStateStore.get(state);
    const stateValid = Boolean(stateMeta && Date.now() - stateMeta.createdAt <= 10 * 60 * 1000);
    oauthStateStore.delete(state);
    if (!stateValid) {
      return res.status(400).send('Invalid or expired OAuth state');
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
      // Backend-local storage is the authoritative catalog. Cloud sync is a replica,
      // not a competing read path, to avoid split-brain drone definitions.
      const drones = await storage.getAllDrones();
      return res.json(drones);
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
      const existingByCallsign = await storage.getDroneByCallsign(validated.callsign);
      if (existingByCallsign) {
        return res.status(409).json({ error: `Drone callsign already exists: ${validated.callsign}` });
      }
      const drone = await storage.createDrone(validated);
      broadcast("drone_added", drone);
      void syncCloudDocument("drones", drone.id, drone, { session: requestSession(req) }).catch(logCloudErr);
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
      const nextCallsign = String(req.body?.callsign || "").trim();
      if (nextCallsign) {
        const existingByCallsign = await storage.getDroneByCallsign(nextCallsign);
        if (existingByCallsign && String(existingByCallsign.id) !== String(req.params.id)) {
          return res.status(409).json({ error: `Drone callsign already exists: ${nextCallsign}` });
        }
      }
      const drone = await storage.updateDrone(req.params.id, req.body);
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      broadcast("drone_updated", drone);
      void syncCloudDocument("drones", drone.id, drone, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("drones", drone.id, drone, { session: requestSession(req) }).catch(logCloudErr);
      void syncCloudDocument("drone_locations", drone.id, {
        id: drone.id,
        latitude,
        longitude,
        altitude,
        heading,
        updatedAt: new Date().toISOString(),
      }, { session: requestSession(req) }).catch(logCloudErr);
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to update drone location" });
    }
  });

  app.delete("/api/drones/:id", async (req, res) => {
    try {
      await storage.deleteDrone(req.params.id);
      broadcast("drone_removed", { id: req.params.id });
      void deleteCloudDocument("drones", req.params.id).catch(logCloudErr);
      void deleteCloudDocument("drone_locations", req.params.id).catch(logCloudErr);
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
      void syncCloudDocument("media_assets", asset.id, asset, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("media_assets", asset.id, asset, { session: requestSession(req) }).catch(logCloudErr);
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to update media asset" });
    }
  });

  app.delete("/api/media/:id", async (req, res) => {
    try {
      await storage.deleteMediaAsset(req.params.id);
      void deleteCloudDocument("media_assets", req.params.id).catch(logCloudErr);
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
      void syncCloudDocument("offline_backlog", item.id, item, { session: requestSession(req) }).catch(logCloudErr);
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
      const items = req.body?.items;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }
      
      const results: Array<{ id: string | null; clientRequestId: string | null; status: "synced" | "failed" | "duplicate"; error?: string }> = [];
      for (const item of items) {
        const itemId = typeof item?.id === "string" ? item.id : null;
        let validatedItem: any;
        try {
          validatedItem = insertOfflineBacklogSchema.parse(item);
        } catch (error: any) {
          const validationError =
            error instanceof ZodError
              ? fromError(error).toString()
              : error?.message || "Invalid backlog item payload";
          results.push({
            id: itemId,
            clientRequestId: null,
            status: "failed",
            error: validationError,
          });
          continue;
        }

        let clientRequestId: string | null = null;
        try {
          clientRequestId = normalizeClientRequestId(validatedItem?.clientRequestId ?? itemId);
        } catch (error: any) {
          results.push({
            id: itemId,
            clientRequestId: null,
            status: "failed",
            error: error?.message || "Invalid clientRequestId",
          });
          continue;
        }

        const existing = offlineSyncIdempotency.get(clientRequestId);
        if (existing && existing.status === "synced") {
          results.push({ id: itemId, clientRequestId, status: "duplicate" });
          continue;
        }

        try {
          const dataType = String(validatedItem?.dataType || "").trim().toLowerCase();
          if (dataType === "telemetry") {
            await storage.createFlightLog(validatedItem.data);
            void appendCloudDocument("flight_logs", validatedItem.data, { session: requestSession(req) }).catch(logCloudErr);
          } else if (dataType === "sensor") {
            await storage.createSensorData(validatedItem.data);
            void appendCloudDocument("sensor_data", validatedItem.data, { session: requestSession(req) }).catch(logCloudErr);
          } else if (dataType === "media") {
            await storage.createMediaAsset(validatedItem.data);
            void appendCloudDocument("media_assets", validatedItem.data, { session: requestSession(req) }).catch(logCloudErr);
          } else if (dataType === "event") {
            void appendCloudDocument(
              "flight_events",
              {
                sessionId: validatedItem?.data?.sessionId || null,
                eventType: String(validatedItem?.data?.eventType || "offline_event"),
                eventData: validatedItem?.data || {},
                recordedAt: validatedItem?.recordedAt || new Date().toISOString(),
              },
              { session: requestSession(req) },
            ).catch(logCloudErr);
          } else {
            throw new Error(`Unsupported backlog dataType: ${dataType || "unknown"}`);
          }
          
          if (itemId) {
            await storage.markBacklogSynced(itemId);
            void deleteCloudDocument("offline_backlog", itemId).catch(logCloudErr);
          }
          offlineSyncIdempotency.set(clientRequestId, { status: "synced" });
          results.push({ id: itemId, clientRequestId, status: "synced" });
        } catch (err: any) {
          offlineSyncIdempotency.set(clientRequestId, { status: "failed", error: err?.message || "sync failed" });
          results.push({ id: itemId, clientRequestId, status: "failed", error: err?.message || "sync failed" });
        }
      }
      
      broadcast("backlog_synced", { count: results.filter(r => r.status === "synced" || r.status === "duplicate").length });
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync backlog" });
    }
  });

  app.patch("/api/backlog/:id/synced", async (req, res) => {
    try {
      await storage.markBacklogSynced(req.params.id);
      void deleteCloudDocument("offline_backlog", req.params.id).catch(logCloudErr);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark as synced" });
    }
  });

  app.delete("/api/backlog/:id", async (req, res) => {
    try {
      await storage.deleteBacklogItem(req.params.id);
      void deleteCloudDocument("offline_backlog", req.params.id).catch(logCloudErr);
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
      const session = (req as any).serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ error: "Authentication required" });

      const isAdmin = String(session.role || "").toLowerCase() === "admin";
      const scopeAll = isAdmin && String(req.query.scope || "").toLowerCase() === "all";
      const requestedUserId = String(req.query.userId || "").trim();

      const messages = scopeAll
        ? await storage.getAllMessages()
        : await storage.getMessagesForUser(requestedUserId && isAdmin ? requestedUserId : session.userId);
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
      const session = (req as any).serverSession as ServerSession | undefined;
      let isAdmin = session?.role === "admin";
      
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
      const session = (req as any).serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ error: "Authentication required" });

      const content = String(req.body?.content || "").trim();
      if (!content) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const rawRecipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
      const normalizedRecipients = rawRecipients
        .map((entry: any) => ({
          id: String(entry?.id || "").trim(),
          name: String(entry?.name || entry?.id || "").trim(),
          type: String(entry?.type || "user") === "group" ? "group" : "user",
        }))
        .filter((entry: any) => entry.id && entry.type === "user" && entry.id !== session.userId);

      const legacyRecipientId = String(req.body?.recipientId || "").trim();
      const legacyRecipientName = String(req.body?.recipientName || legacyRecipientId || "").trim();
      if (legacyRecipientId && !normalizedRecipients.some((entry: any) => entry.id === legacyRecipientId)) {
        normalizedRecipients.push({ id: legacyRecipientId, name: legacyRecipientName || legacyRecipientId, type: "user" });
      }

      const recipients = normalizedRecipients.length ? normalizedRecipients : null;
      const recipientId = recipients && recipients.length === 1 ? recipients[0].id : null;
      const recipientName = recipients && recipients.length === 1 ? recipients[0].name : null;

      const message = await storage.createMessage({
        senderId: session.userId,
        senderName: session.name,
        senderRole: session.role,
        content,
        recipientId,
        recipientName,
        recipients,
      });
      smartBroadcast("new_message", message);
      void syncCloudDocument("messages", message.id, message, {
        session,
        visibility: message.recipientId || (Array.isArray(message.recipients) && message.recipients.length > 0) ? "dm" : "shared",
        recipientId: message.recipientId || null,
        recipientName: message.recipientName || null,
      }).catch(logCloudErr);
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
      const session = (req as any).serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ error: "Authentication required" });

      const content = String(req.body?.content || "").trim();
      if (!content) {
        return res.status(400).json({ error: "Content required" });
      }

      const existing = await storage.getMessageById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Message not found" });
      }
      const isAdmin = String(session.role || "").toLowerCase() === "admin";
      if (!isAdmin && existing.senderId !== session.userId) {
        return res.status(403).json({ error: "Only sender or admin can edit messages" });
      }

      const message = await storage.updateMessage(req.params.id, content);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      // Use smartBroadcast for DM privacy
      smartBroadcast("message_updated", message);
      void syncCloudDocument("messages", message.id, message, {
        session,
        visibility: message.recipientId || (Array.isArray(message.recipients) && message.recipients.length > 0) ? "dm" : "shared",
        recipientId: message.recipientId || null,
        recipientName: message.recipientName || null,
      }).catch(logCloudErr);
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
      const session = (req as any).serverSession as ServerSession | undefined;
      if (!session) return res.status(401).json({ error: "Authentication required" });

      const msg = await storage.getMessageById(req.params.id);
      if (!msg) return res.status(404).json({ error: "Message not found" });
      const isAdmin = String(session.role || "").toLowerCase() === "admin";
      if (!isAdmin && msg.senderId !== session.userId) {
        return res.status(403).json({ error: "Only sender or admin can delete messages" });
      }

      await storage.deleteMessage(req.params.id, session.userId);
      
      // Use smartBroadcast for DM privacy
      if (msg) {
        smartBroadcast("message_deleted", {
          id: req.params.id,
          senderId: msg.senderId,
          recipientId: msg.recipientId,
          recipients: Array.isArray(msg.recipients) ? msg.recipients : null,
        });
      } else {
        broadcast("message_deleted", { id: req.params.id });
      }
      void deleteCloudDocument("messages", req.params.id).catch(logCloudErr);
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
      const session = (req as any).serverSession as ServerSession | undefined;
      if (!session || !hasServerPermission(session, "user_management")) {
        return res.status(403).json({ error: "Admin or user management permissions required" });
      }
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

  app.post("/api/cloud/commands/dispatch", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!hasOperatorControlPermission(session)) {
        return res.status(403).json({ success: false, error: "Operator or admin permissions required" });
      }
      if (!cloudSyncEnabled()) {
        return res.status(503).json({ success: false, error: "Cloud sync is not enabled" });
      }

      const droneId = String(req.body?.droneId || "").trim();
      const commandType = String(req.body?.commandType || "").trim().toLowerCase();
      const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
      const priority = Math.max(0, Math.min(10, Number(req.body?.priority ?? 5)));
      const ttlSec = Math.max(5, Math.min(3600, Number(req.body?.ttlSec ?? 90)));
      if (!droneId) return res.status(400).json({ success: false, error: "droneId is required" });
      if (!commandType) return res.status(400).json({ success: false, error: "commandType is required" });

      const commandId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
      const nowIso = new Date().toISOString();
      const command = {
        id: commandId,
        droneId,
        commandType,
        payload,
        priority,
        ttlSec,
        status: "queued",
        queuedAt: nowIso,
        expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
        issuedBy: {
          userId: session!.userId,
          name: session!.name,
          role: session!.role,
        },
      };

      await syncCloudDocument("cloud_commands", commandId, command, { session });
      const rtdb = getFirebaseAdminRtdb();
      if (rtdb) {
        await rtdb.ref(`commands/${droneId}/${commandId}`).set(command);
      }
      await publishCloudRealtime("cloud_command", command, { session });
      pushDebugEvent("success", "cloud.command_dispatch", "Cloud command queued", {
        commandId,
        droneId,
        commandType,
        priority,
      });
      res.json({ success: true, command });
    } catch (error: any) {
      pushDebugEvent("error", "cloud.command_dispatch", "Failed to queue cloud command", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Failed to queue cloud command" });
    }
  });

  app.post("/api/cloud/commands/:id/ack", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!hasOperatorControlPermission(session) && !hasValidAdminKey(req)) {
        return res.status(403).json({ success: false, error: "Operator/admin permissions or admin API key required" });
      }
      if (!cloudSyncEnabled()) {
        return res.status(503).json({ success: false, error: "Cloud sync is not enabled" });
      }

      const commandId = String(req.params.id || "").trim();
      const droneId = String(req.body?.droneId || "").trim();
      const status = String(req.body?.status || "acknowledged").trim().toLowerCase();
      const result = req.body?.result ?? null;
      const allowedStatuses = new Set(["acknowledged", "in_progress", "completed", "failed", "rejected", "expired"]);
      if (!commandId) return res.status(400).json({ success: false, error: "command id is required" });
      if (!droneId) return res.status(400).json({ success: false, error: "droneId is required" });
      if (!allowedStatuses.has(status)) return res.status(400).json({ success: false, error: "Invalid status" });

      const ackPayload = {
        status,
        result,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: {
          droneId,
          userId: session?.userId || null,
          name: session?.name || null,
          role: session?.role || null,
        },
      };

      await syncCloudDocument("cloud_commands", commandId, ackPayload, { session });
      const rtdb = getFirebaseAdminRtdb();
      if (rtdb) {
        await rtdb.ref(`commands/${droneId}/${commandId}/ack`).set(ackPayload);
      }
      await publishCloudRealtime("cloud_command_ack", { commandId, droneId, ...ackPayload }, { session });
      pushDebugEvent(status === "failed" || status === "rejected" ? "warn" : "success", "cloud.command_ack", "Cloud command acknowledged", {
        commandId,
        droneId,
        status,
      });
      res.json({ success: true, commandId, droneId, status });
    } catch (error: any) {
      pushDebugEvent("error", "cloud.command_ack", "Failed to acknowledge cloud command", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Failed to acknowledge cloud command" });
    }
  });

  app.get("/api/cloud/commands", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!hasOperatorControlPermission(session)) {
        return res.status(403).json({ success: false, error: "Operator or admin permissions required" });
      }
      const droneId = String(req.query.droneId || "").trim();
      const status = String(req.query.status || "").trim().toLowerCase();
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
      const records = await getRecentCloudDocs("cloud_commands", Math.max(limit * 2, 200));
      const filtered = records.filter((r: any) => {
        if (droneId && String(r?.droneId || "") !== droneId) return false;
        if (status && String(r?.status || "").toLowerCase() !== status) return false;
        return true;
      }).slice(0, limit);
      res.json({ success: true, commands: filtered, total: filtered.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to fetch cloud commands" });
    }
  });

  app.post("/api/cloud/telemetry/ingest", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!hasOperatorControlPermission(session) && !hasValidAdminKey(req)) {
        return res.status(403).json({ success: false, error: "Operator/admin permissions or admin API key required" });
      }
      if (!cloudSyncEnabled()) {
        return res.status(503).json({ success: false, error: "Cloud sync is not enabled" });
      }
      const droneId = String(req.body?.droneId || "").trim();
      const telemetry = req.body?.telemetry && typeof req.body.telemetry === "object" ? req.body.telemetry : {};
      if (!droneId) return res.status(400).json({ success: false, error: "droneId is required" });

      const capturedAt = new Date().toISOString();
      const telemetryId = `${droneId}-${Date.now()}-${randomBytes(3).toString("hex")}`;
      const payload = { id: telemetryId, droneId, telemetry, capturedAt };
      await appendCloudDocument("drone_telemetry", payload, { session });
      await syncCloudDocument("drone_telemetry_latest", droneId, payload, { session });
      const rtdb = getFirebaseAdminRtdb();
      if (rtdb) {
        await rtdb.ref(`telemetry/${droneId}/latest`).set(payload);
      }
      await publishCloudRealtime("drone_telemetry", payload, { session });
      res.json({ success: true, telemetryId, capturedAt });
    } catch (error: any) {
      pushDebugEvent("error", "cloud.telemetry_ingest", "Failed telemetry ingest", {
        error: error?.message || String(error),
      });
      res.status(500).json({ success: false, error: error?.message || "Failed telemetry ingest" });
    }
  });

  app.get("/api/cloud/telemetry/live", async (req, res) => {
    try {
      const session = requestSession(req);
      if (!hasTelemetryReadPermission(session)) {
        return res.status(403).json({ success: false, error: "Telemetry read permission required" });
      }
      const droneId = String(req.query.droneId || "").trim();
      const limit = Math.max(1, Math.min(300, Number(req.query.limit || 100)));
      const latest = await getRecentCloudDocs("drone_telemetry_latest", 500);
      const history = await getRecentCloudDocs("drone_telemetry", Math.max(limit * 2, 200));
      const latestFiltered = latest.filter((item: any) => !droneId || item?.droneId === droneId);
      const historyFiltered = history.filter((item: any) => !droneId || item?.droneId === droneId).slice(0, limit);
      res.json({
        success: true,
        latest: latestFiltered,
        history: historyFiltered,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to fetch live telemetry" });
    }
  });

  app.get("/api/cloud/config", async (_req, res) => {
    const effective = await getEffectiveCloudConfig();
    const serviceAccountPathExists = Boolean(effective.serviceAccountPath && existsSync(effective.serviceAccountPath));
    res.json({
      success: true,
      projectId: effective.projectId || "",
      databaseURL: effective.databaseURL || "",
      storageBucket: effective.storageBucket || "",
      serviceAccountPath: effective.serviceAccountPath || "",
      hasServiceAccountJson: Boolean(effective.serviceAccountJson),
      hasServiceAccountBase64: Boolean(effective.serviceAccountBase64),
      hasServiceAccountPath: serviceAccountPathExists,
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
    const serviceAccountPathExists = Boolean(effective.serviceAccountPath && existsSync(effective.serviceAccountPath));
    res.json({
      enabled: cloudSyncEnabled(),
      projectId: effective.projectId || null,
      databaseUrl: effective.databaseURL || null,
      storageBucket: effective.storageBucket || null,
      hasServiceAccount: Boolean(
        effective.serviceAccountJson ||
        effective.serviceAccountBase64 ||
        serviceAccountPathExists
      ),
      serviceAccountPathExists,
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
          const items = JSON.parse(await readFile(filepath, "utf-8"));
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
        pushDebugEvent(
          probe.success ? "success" : (probe.degraded ? "warn" : "error"),
          "debug.system",
          probe.success ? "System debug probe passed" : "System debug probe failed",
          probe,
        );
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
          activeUserSessions: getSessionMap().size,
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
      pushDebugEvent(
        probe.success ? "success" : (probe.degraded ? "warn" : "error"),
        "debug.system",
        probe.success ? "Manual system debug probe passed" : "Manual system debug probe failed",
        probe,
      );
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
          const recipients = Array.isArray(m?.recipients)
            ? m.recipients
                .filter((entry: any) => entry?.type === "user")
                .map((entry: any) => String(entry.id || "").trim())
                .filter(Boolean)
            : [];
          return m.senderId === session.userId || m.recipientId === session.userId || recipients.includes(session.userId);
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
      void appendCloudDocument("flight_logs", flightLog, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("flight_sessions", session.id, session, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("flight_sessions", session.id, session, { session: requestSession(req) }).catch(logCloudErr);
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
      void syncCloudDocument("flight_sessions", session.id, session, { session: requestSession(req) }).catch(logCloudErr);
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
      void deleteCloudDocument("flight_sessions", req.params.id).catch(logCloudErr);
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
      
      // If not on Pi, reject to avoid false-positive command execution.
      if (!isRaspberryPi) {
        return res.status(503).json({
          success: false,
          error: "Servo control requires onboard hardware runtime",
          action,
        });
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
          return res.status(500).json({
            success: false,
            error: "Servo control bridge failed to start",
            details: err?.message || String(err),
          });
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

  app.post("/api/stabilization/actuate", async (req, res) => {
    try {
      const connectionString = String(req.body?.connectionString || "").trim();
      if (!connectionString) {
        return res.status(400).json({ success: false, error: "connectionString is required" });
      }

      const corrections = req.body?.corrections && typeof req.body.corrections === "object" ? req.body.corrections : {};
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const toNum = (value: unknown, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };

      const roll = toNum((corrections as any).roll, 0);
      const pitch = toNum((corrections as any).pitch, 0);
      const yaw = toNum((corrections as any).yaw, 0);
      const throttle = toNum((corrections as any).throttle, 0);
      const forward = toNum((corrections as any).forward, 0);
      const lateral = toNum((corrections as any).lateral, 0);

      const x = Math.round(clamp((forward * 140) + (pitch * 45), -1000, 1000));
      const y = Math.round(clamp((lateral * 140) + (roll * 45), -1000, 1000));
      const r = Math.round(clamp(yaw * 55, -1000, 1000));
      const z = Math.round(clamp(500 + throttle * 65, 0, 1000));
      const durationMs = Math.round(clamp(toNum(req.body?.durationMs, 220), 120, 1200));

      const result = await runMavlinkVehicleControl([
        "manual",
        "--connection",
        connectionString,
        "--x",
        String(x),
        "--y",
        String(y),
        "--z",
        String(z),
        "--r",
        String(r),
        "--buttons",
        "0",
        "--duration-ms",
        String(durationMs),
        "--timeout",
        "6",
      ]);

      if (!result.ok) {
        return res.status(500).json({
          success: false,
          error: result.error || "Stabilization actuator dispatch failed",
          result: result.data || null,
        });
      }

      const nowIso = new Date().toISOString();
      pushDebugEvent("info", "stabilization.actuate", "Stabilization actuator command dispatched", {
        connectionString,
        source: String(req.body?.source || "unknown"),
        x,
        y,
        z,
        r,
        durationMs,
      });

      res.json({
        success: true,
        command: {
          connectionString,
          source: String(req.body?.source || "unknown"),
          sentAt: nowIso,
          manualControl: { x, y, z, r, durationMs },
        },
        result: result.data,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "Failed to actuate stabilization controls" });
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

  httpServer.once("close", () => {
    stopAllMissionRunProgressMonitors();
    void persistRuntimeState();
  });

  return httpServer;
}
