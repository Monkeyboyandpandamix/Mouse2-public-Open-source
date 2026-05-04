/**
 * Lightweight write-through helpers that mirror legacy localStorage-based
 * settings into the unified backend app-config store.
 *
 * Usage:
 *   import { mirrorToCentralConfig } from "@/lib/centralConfig";
 *   localStorage.setItem("mouse_theme", value);
 *   mirrorToCentralConfig("ui.theme", value);
 *
 * The mirror call is fire-and-forget: it never throws, and if the user has
 * no system_settings permission it just no-ops (the local change still
 * applied). When the request DOES land, every other connected GCS receives
 * an `app_config_updated` WS broadcast and reflects the new value live.
 */

import { apiFetch } from "./api";
import { APP_CONFIG_KEYS } from "@shared/appConfig";

const LEGACY_TO_CENTRAL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const def of APP_CONFIG_KEYS) {
    if (def.legacyLocalStorageKey) out[def.legacyLocalStorageKey] = def.key;
  }
  return out;
})();

const inflight = new Map<string, number>();
const DEBOUNCE_MS = 400;

/** Push a single key/value to the unified backend app-config store. */
export function mirrorToCentralConfig(centralKey: string, value: unknown): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const last = inflight.get(centralKey) ?? 0;
  if (now - last < DEBOUNCE_MS) return; // coalesce rapid setters
  inflight.set(centralKey, now);
  // Parse JSON-strings so we store the actual value, not the literal string.
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = value; }
  }
  void apiFetch(`/api/app-config/${encodeURIComponent(centralKey)}`, {
    method: "PUT",
    body: JSON.stringify({ value: parsed }),
  }).catch(() => {
    // 401 (not yet logged in) / 403 (no system_settings perm) → silent.
    // localStorage already has the value, so this device still works.
  });
}

/**
 * Map a legacy localStorage key to its central app-config key. Returns null
 * if the legacy key isn't registered.
 */
export function centralKeyForLegacy(legacyKey: string): string | null {
  return LEGACY_TO_CENTRAL[legacyKey] ?? null;
}

/**
 * Install a global hook so EVERY localStorage.setItem with a registered legacy
 * key automatically pushes to the central store too. Idempotent: safe to call
 * multiple times. Call once at app start.
 */
// Module-level reference to the unpatched, native setItem so the WS bridge
// can write without triggering the upstream mirror.
let originalSetItemRef: ((key: string, value: string) => void) | null = null;

export function installLocalStorageMirror(): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__mouseLocalStorageMirrorInstalled) return;
  w.__mouseLocalStorageMirrorInstalled = true;

  originalSetItemRef = window.localStorage.setItem.bind(window.localStorage);
  window.localStorage.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItemRef!(key, value);
    // Suppression flag honored *inside* the patched setter so the WS bridge
    // can call us without echoing back to the server.
    if ((window as any).__mouseSuppressMirror) return;
    const central = LEGACY_TO_CENTRAL[key];
    if (central) mirrorToCentralConfig(central, value);
  } as typeof window.localStorage.setItem;
}

/**
 * Install a listener that turns incoming `app-config-updated` events (fanned
 * out by TopBar from the WS broadcast) into legacy `localStorage` writes +
 * the existing `gui-config-changed` CustomEvent, so panels that still read
 * from localStorage automatically pick up cross-client changes.
 */
export function installAppConfigBridge(): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__mouseAppConfigBridgeInstalled) return;
  w.__mouseAppConfigBridgeInstalled = true;

  window.addEventListener("app-config-updated", (e: Event) => {
    const detail = (e as CustomEvent<{ key?: string; value?: unknown }>).detail;
    if (!detail?.key) return;
    const def = APP_CONFIG_KEYS.find((k) => k.key === detail.key);
    if (!def?.legacyLocalStorageKey) return;
    try {
      const serialized =
        typeof detail.value === "string" ? detail.value : JSON.stringify(detail.value);
      // Suppress the mirror so we don't echo back to the server.
      const w2 = window as any;
      const prev = w2.__mouseSuppressMirror;
      w2.__mouseSuppressMirror = true;
      try {
        window.localStorage.setItem(def.legacyLocalStorageKey, serialized);
      } finally {
        w2.__mouseSuppressMirror = prev;
      }
    } catch {
      /* ignore quota / serialization errors */
    }
    // Fire the legacy event so panels listening to it re-render.
    window.dispatchEvent(
      new CustomEvent("gui-config-changed", { detail: { [def.key]: detail.value } }),
    );
  });
}
