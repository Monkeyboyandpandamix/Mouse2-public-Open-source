import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { HARDCODED_FIREBASE_PROJECT } from "@shared/hardcodedFirebaseConfig";

let warnedMissingConfig = false;
const runtimeDataDir = process.env.DATA_DIR || "./data";
const RUNTIME_CONFIG_PATH = path.resolve(runtimeDataDir, "cloud_runtime_config.json");

type RuntimeCloudConfig = {
  projectId?: string;
  databaseURL?: string;
  storageBucket?: string;
  serviceAccountPath?: string;
  serviceAccountJson?: string;
  serviceAccountBase64?: string;
};

function readRuntimeCloudConfig(): RuntimeCloudConfig {
  try {
    if (!fs.existsSync(RUNTIME_CONFIG_PATH)) return {};
    const raw = fs.readFileSync(RUNTIME_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function getConfigValue<K extends keyof RuntimeCloudConfig>(key: K, envKey: string): string | undefined {
  const fromEnv = process.env[envKey];
  if (fromEnv && String(fromEnv).trim().length > 0) return fromEnv;
  const runtime = readRuntimeCloudConfig();
  const v = runtime[key];
  if (typeof v === "string" && v.trim().length > 0) return v;

  const hardcodedMap: Partial<Record<keyof RuntimeCloudConfig, string | undefined>> = {
    projectId: HARDCODED_FIREBASE_PROJECT.projectId,
    databaseURL: HARDCODED_FIREBASE_PROJECT.databaseURL,
    storageBucket: HARDCODED_FIREBASE_PROJECT.storageBucket,
    serviceAccountPath: HARDCODED_FIREBASE_PROJECT.serviceAccountPath,
  };
  const fallback = hardcodedMap[key];
  return typeof fallback === "string" && fallback.trim().length > 0 ? fallback : undefined;
}

function readServiceAccountFromEnv() {
  const fromJson = getConfigValue("serviceAccountJson", "FIREBASE_SERVICE_ACCOUNT_JSON");
  if (fromJson) {
    return JSON.parse(fromJson);
  }

  const fromBase64 = getConfigValue("serviceAccountBase64", "FIREBASE_SERVICE_ACCOUNT_BASE64");
  if (fromBase64) {
    const decoded = Buffer.from(fromBase64, "base64").toString("utf8");
    return JSON.parse(decoded);
  }

  const fromPath = getConfigValue("serviceAccountPath", "FIREBASE_SERVICE_ACCOUNT_PATH");
  if (fromPath && fs.existsSync(fromPath)) {
    const raw = fs.readFileSync(fromPath, "utf8");
    return JSON.parse(raw);
  }

  return null;
}

function ensureFirebaseAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = readServiceAccountFromEnv();
  const projectId = getConfigValue("projectId", "FIREBASE_PROJECT_ID");
  const databaseURL = getConfigValue("databaseURL", "FIREBASE_DATABASE_URL");
  const storageBucket = getConfigValue("storageBucket", "FIREBASE_STORAGE_BUCKET");

  if (!serviceAccount || !projectId) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn("[firebase-admin] not configured. Set FIREBASE_PROJECT_ID and a service account env value.");
    }
    return null;
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
    databaseURL,
    storageBucket,
  });
}

export function getFirebaseAdminApp() {
  return ensureFirebaseAdminApp();
}

export function getFirebaseAdminDb() {
  const app = ensureFirebaseAdminApp();
  if (!app) return null;
  return admin.firestore(app);
}

export function getFirebaseAdminRtdb() {
  const app = ensureFirebaseAdminApp();
  if (!app) return null;
  return admin.database(app);
}

export function getFirebaseAdminStorage() {
  const app = ensureFirebaseAdminApp();
  if (!app) return null;
  return admin.storage(app);
}

export async function resetFirebaseAdminApp() {
  const apps = [...admin.apps].filter((a): a is admin.app.App => Boolean(a));
  await Promise.all(apps.map((a) => a.delete().catch(() => {})));
  warnedMissingConfig = false;
}
