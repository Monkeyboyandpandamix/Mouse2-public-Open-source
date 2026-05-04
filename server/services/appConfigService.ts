import {
  APP_CONFIG_CATEGORY,
  APP_CONFIG_KEYS,
  appConfigDefaults,
  appConfigKey,
  type AppConfigSnapshot,
} from "@shared/appConfig";
import { storage } from "../storage.js";
import { getFirebaseAdminRtdb } from "../firebaseAdmin.js";
import { syncCloudDocument, logCloudErr } from "../cloudSync.js";
import { randomBytes } from "crypto";

type WsBroadcast = (type: string, data: any) => void;

let wsBroadcast: WsBroadcast | null = null;
const cache: Map<string, unknown> = new Map();
let warmedUp = false;

// Per-process origin id stamped on every RTDB write so we can ignore the echo
// of our own writes when the listener fires.
const PROCESS_ORIGIN_ID = `gcs-${randomBytes(4).toString("hex")}`;

/** Wired from server/routes.ts so the service can push live updates. */
export function setAppConfigBroadcast(broadcast: WsBroadcast): void {
  wsBroadcast = broadcast;
}

async function loadCacheFromStorage(): Promise<void> {
  try {
    const rows = await storage.getSettingsByCategory(APP_CONFIG_CATEGORY);
    for (const row of rows) cache.set(row.key, row.value);
  } catch (err) {
    console.warn("[appConfig] failed to load settings from storage:", (err as Error).message);
  }
  warmedUp = true;
}

async function ensureWarm(): Promise<void> {
  if (!warmedUp) await loadCacheFromStorage();
}

/** Snapshot = defaults overlaid with any persisted values. */
export async function getAppConfigSnapshot(): Promise<AppConfigSnapshot> {
  await ensureWarm();
  const out = appConfigDefaults();
  cache.forEach((v, k) => { out[k] = v; });
  return out;
}

export async function getAppConfigValue(key: string): Promise<unknown> {
  await ensureWarm();
  if (cache.has(key)) return cache.get(key);
  return appConfigKey(key)?.default ?? null;
}

/** Validate that the key is registered. Unknown keys are rejected. */
export function isKnownAppConfigKey(key: string): boolean {
  return !!appConfigKey(key);
}

export const APP_CONFIG_KEY_LIST = APP_CONFIG_KEYS.map((k) => k.key);

/**
 * Persist a value, mirror to RTDB, broadcast to WS clients. Returns the new
 * value. Throws on unknown keys so callers can return 400. ORDER matters:
 * durable storage MUST succeed before the cache is updated, the RTDB mirror is
 * pushed, or any client is notified — otherwise a failed write would leave a
 * lying cache and a phantom WS update.
 */
export async function setAppConfigValue(
  key: string,
  value: unknown,
  meta?: { actorUserId?: string | null; actorRole?: string | null },
): Promise<unknown> {
  const def = appConfigKey(key);
  if (!def) throw new Error(`Unknown app config key: ${key}`);
  await ensureWarm();

  // 1) Postgres / file storage FIRST so we never advertise a value we failed
  //    to durably persist.
  await storage.upsertSetting({ key, value: value as any, category: APP_CONFIG_CATEGORY });

  // 2) Only after durable success, update the in-memory cache.
  cache.set(key, value);

  // 3) Firebase RTDB mirror — best-effort, fire-and-forget. Stamped with our
  //    PROCESS_ORIGIN_ID so the listener can ignore the echo from this write.
  void mirrorToRtdb(key, value, meta).catch((err) =>
    console.warn(`[appConfig] RTDB mirror failed for ${key}:`, err?.message),
  );

  // 4) Firestore mirror via existing sync queue (so cross-instance reads
  //    work even when RTDB is unavailable)
  void syncCloudDocument(
    "app_config",
    key,
    { key, value, category: def.category, updatedAt: new Date().toISOString() },
    {
      session: meta?.actorUserId
        ? { userId: meta.actorUserId, role: meta.actorRole ?? null, name: null }
        : null,
    },
  ).catch(logCloudErr);

  // 5) WebSocket fan-out so every connected GCS reacts immediately.
  if (wsBroadcast) {
    wsBroadcast("app_config_updated", {
      key,
      value,
      category: def.category,
      ts: Date.now(),
      origin: PROCESS_ORIGIN_ID,
    });
  }

  return value;
}

async function mirrorToRtdb(
  key: string,
  value: unknown,
  meta?: { actorUserId?: string | null; actorRole?: string | null },
): Promise<void> {
  const rtdb = getFirebaseAdminRtdb();
  if (!rtdb) return;
  await rtdb.ref(`app_config/${encodeRtdbKey(key)}`).set({
    value: value === undefined ? null : value,
    updatedAt: Date.now(),
    origin: PROCESS_ORIGIN_ID,
    actor: {
      userId: meta?.actorUserId ?? null,
      role: meta?.actorRole ?? null,
    },
  });
}

function encodeRtdbKey(key: string): string {
  // RTDB keys cannot contain . $ # [ ] /
  return key.replace(/\./g, "__");
}

/**
 * Apply many keys (loop). Returns the merged snapshot. If any key fails to
 * persist, we throw and any earlier keys remain applied (no transaction).
 */
export async function patchAppConfig(
  patch: Record<string, unknown>,
  meta?: { actorUserId?: string | null; actorRole?: string | null },
): Promise<AppConfigSnapshot> {
  for (const key of Object.keys(patch)) {
    if (!isKnownAppConfigKey(key)) {
      throw new Error(`Unknown app config key: ${key}`);
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    await setAppConfigValue(key, value, meta);
  }
  return await getAppConfigSnapshot();
}

/**
 * Subscribe to RTDB changes pushed by other GCS instances or external admin
 * tooling. When a remote update comes in, refresh local cache and broadcast
 * to local WS clients so this instance stays in sync.
 *
 * We listen to BOTH child_changed AND child_added because the very first time
 * a key is written from another process we'd otherwise miss it. Echoes of our
 * own writes (matching PROCESS_ORIGIN_ID) are ignored to prevent loops.
 */
export function startRtdbAppConfigListener(): void {
  const rtdb = getFirebaseAdminRtdb();
  if (!rtdb) return;
  const handler = (snap: any) => {
    try {
      const encodedKey = snap.key as string;
      const decodedKey = String(encodedKey).replace(/__/g, ".");
      const payload = snap.val() || {};
      if (!isKnownAppConfigKey(decodedKey)) return;
      // Skip echoes of our own writes.
      if (payload.origin && payload.origin === PROCESS_ORIGIN_ID) return;
      // Persist locally first so a crash right after this doesn't lose the
      // remote update; only THEN update cache + broadcast.
      void (async () => {
        try {
          await storage.upsertSetting({
            key: decodedKey,
            value: payload.value as any,
            category: APP_CONFIG_CATEGORY,
          });
          cache.set(decodedKey, payload.value);
          if (wsBroadcast) {
            wsBroadcast("app_config_updated", {
              key: decodedKey,
              value: payload.value,
              category: appConfigKey(decodedKey)?.category,
              ts: Date.now(),
              source: "rtdb",
            });
          }
        } catch (err) {
          console.warn("[appConfig] failed to persist RTDB update:", (err as Error).message);
        }
      })();
    } catch (err) {
      console.warn("[appConfig] RTDB handler error:", (err as Error).message);
    }
  };
  try {
    const ref = rtdb.ref("app_config");
    ref.on("child_added", handler);
    ref.on("child_changed", handler);
    console.log("[appConfig] RTDB listener attached at /app_config (added+changed)");
  } catch (err) {
    console.warn("[appConfig] failed to attach RTDB listener:", (err as Error).message);
  }
}
