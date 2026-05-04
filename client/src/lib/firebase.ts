import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { HARDCODED_FIREBASE_WEB_APPS } from "@shared/hardcodedFirebaseConfig";

type FirebaseClientConfig = {
  apiKey?: string | null;
  authDomain?: string | null;
  databaseURL?: string | null;
  projectId?: string | null;
  storageBucket?: string | null;
  messagingSenderId?: string | null;
  appId?: string | null;
  measurementId?: string | null;
};

const env: FirebaseClientConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.authDomain,
  databaseURL: (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.databaseURL,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.storageBucket,
  messagingSenderId:
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.appId,
  measurementId:
    (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) || HARDCODED_FIREBASE_WEB_APPS.primary.measurementId,
};

const REQUIRED_KEYS: (keyof FirebaseClientConfig)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

function hasAllRequired(cfg: FirebaseClientConfig): boolean {
  return REQUIRED_KEYS.every((k) => typeof cfg[k] === "string" && (cfg[k] as string).trim().length > 0);
}

let resolvedConfig: FirebaseClientConfig = { ...env };
let configFetchPromise: Promise<FirebaseClientConfig> | null = null;

async function fetchPublicConfig(): Promise<FirebaseClientConfig> {
  if (configFetchPromise) return configFetchPromise;
  configFetchPromise = (async () => {
    try {
      const r = await fetch("/api/cloud/config/public");
      if (!r.ok) return resolvedConfig;
      const data = await r.json();
      const merged: FirebaseClientConfig = {
        apiKey: data.apiKey || resolvedConfig.apiKey,
        authDomain: data.authDomain || resolvedConfig.authDomain,
        databaseURL: data.databaseURL || resolvedConfig.databaseURL,
        projectId: data.projectId || resolvedConfig.projectId,
        storageBucket: data.storageBucket || resolvedConfig.storageBucket,
        messagingSenderId: data.messagingSenderId || resolvedConfig.messagingSenderId,
        appId: data.appId || resolvedConfig.appId,
        measurementId: data.measurementId || resolvedConfig.measurementId,
      };
      resolvedConfig = merged;
      return merged;
    } catch {
      return resolvedConfig;
    }
  })();
  return configFetchPromise;
}

let app: FirebaseApp | null = null;
let analyticsInstance: Analytics | null = null;
let analyticsInitStarted = false;

function buildApp(cfg: FirebaseClientConfig): FirebaseApp | null {
  if (!hasAllRequired(cfg)) return null;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }
  app = initializeApp({
    apiKey: cfg.apiKey!,
    authDomain: cfg.authDomain!,
    databaseURL: cfg.databaseURL || undefined,
    projectId: cfg.projectId!,
    storageBucket: cfg.storageBucket!,
    messagingSenderId: cfg.messagingSenderId!,
    appId: cfg.appId!,
    measurementId: cfg.measurementId || undefined,
  });
  return app;
}

export const firebaseEnabled = hasAllRequired(env);

export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  if (hasAllRequired(env)) {
    return buildApp(env);
  }
  return null;
}

export async function getFirebaseAppAsync(): Promise<FirebaseApp | null> {
  if (app) return app;
  const sync = getFirebaseApp();
  if (sync) return sync;
  const cfg = await fetchPublicConfig();
  return buildApp(cfg);
}

export async function getFirebaseAnalyticsSafe(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (analyticsInitStarted) return null;
  if (typeof window === "undefined") return null;
  analyticsInitStarted = true;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const firebaseApp = await getFirebaseAppAsync();
    if (!firebaseApp) return null;
    analyticsInstance = getAnalytics(firebaseApp);
    return analyticsInstance;
  } catch {
    return null;
  }
}

export async function getResolvedFirebaseConfig(): Promise<FirebaseClientConfig> {
  if (hasAllRequired(env)) return env;
  return fetchPublicConfig();
}
