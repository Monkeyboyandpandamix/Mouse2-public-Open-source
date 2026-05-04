/**
 * Unified application configuration registry.
 *
 * SINGLE SOURCE OF TRUTH: every entry below is the authoritative description
 * of one configuration value owned by the backend. Both the server and the
 * client read defaults from here, and writes go through `/api/app-config`
 * (which mirrors them to the Postgres `settings` table AND Firebase RTDB so
 * all connected GCS instances see the change live).
 *
 * Adding a new centralized config:
 *   1. Add an entry to APP_CONFIG_KEYS below.
 *   2. (optional) Add a typed accessor to AppConfigShape if you want strong
 *      typing in TypeScript consumers.
 *   3. On the client, replace any `localStorage.getItem("foo")` call with
 *      `useAppConfigValue("foo.bar")` / `setConfig("foo.bar", value)`.
 *
 * Live in-flight changes:
 *   - Every PATCH/POST on /api/app-config emits a WS `app_config_updated`
 *     event with `{ key, value, category }` so every connected client can
 *     update its cache without polling.
 *   - The server simultaneously writes the new value to RTDB at
 *     `/app_config/<key>`, which lets cloud dashboards / external observers
 *     subscribe via Firebase too.
 */

export type AppConfigCategory =
  | "ui"             // theme, GUI layout, panel visibility
  | "hardware"       // GPIO pins, motor count, primary camera, sensors
  | "navigation"     // base location, GPS-denied config, ML nav config
  | "stabilization"  // ML stabilization config
  | "inputs"         // gamepad / joystick / keyboard mapping
  | "geofence"       // legacy local-cache key (zones are on the drone row)
  | "telemetry"      // sim toggles, range
  | "comms"          // chat / radio defaults
  | "cloud"          // firebase, google sheets/drive endpoints (mirrors /api/cloud/config)
  | "system";        // misc

export interface AppConfigKey {
  /** Dotted key, e.g. "ui.theme". MUST be unique across the registry. */
  key: string;
  category: AppConfigCategory;
  /** JSON-serializable default. */
  default: unknown;
  description: string;
  /**
   * Optional client-side localStorage key used by older code. When migrating
   * we copy this value into the central store on first sync if the central
   * store has no value yet.
   */
  legacyLocalStorageKey?: string;
  /**
   * If true, this key is sensitive (do not return on /api/app-config/public).
   * Reserved for future use — current snapshot endpoint is auth-gated.
   */
  sensitive?: boolean;
}

export const APP_CONFIG_KEYS: readonly AppConfigKey[] = [
  // ── UI ────────────────────────────────────────────────────────────────
  {
    key: "ui.theme",
    category: "ui",
    default: "dark",
    description: "Color theme: dark | light | system",
    legacyLocalStorageKey: "mouse_theme",
  },
  {
    key: "ui.guiTabs",
    category: "ui",
    default: null,
    description: "Per-operator GUI tab definition list (custom tab order/visibility)",
    legacyLocalStorageKey: "mouse_gui_tabs",
  },
  {
    key: "ui.guiPanels",
    category: "ui",
    default: null,
    description: "Per-operator GUI panel mapping (which panels live in which tab)",
    legacyLocalStorageKey: "mouse_gui_panels",
  },
  {
    key: "ui.guiWidgets",
    category: "ui",
    default: null,
    description: "Custom widget definitions added by the operator",
    legacyLocalStorageKey: "mouse_gui_widgets",
  },

  // ── Hardware ─────────────────────────────────────────────────────────
  {
    key: "hardware.config",
    category: "hardware",
    default: null,
    description:
      "Hardware config blob: GPIO pin assignments, primary camera, motor count, optional sensor list, etc.",
    legacyLocalStorageKey: "mouse_hardware_config",
  },
  {
    key: "hardware.motorCount",
    category: "hardware",
    default: 4,
    description: "Number of motors on the active airframe (used by ESC + telemetry panels)",
    legacyLocalStorageKey: "mouse_motor_count",
  },
  {
    key: "hardware.airframeProfile",
    category: "hardware",
    default: "quad",
    description: "Airframe profile name (quad, hex, octo, custom)",
    legacyLocalStorageKey: "mouse_airframe_profile",
  },
  {
    key: "hardware.cameraPosition",
    category: "hardware",
    default: null,
    description:
      "Primary camera placement preset {x,y} for the operator video feed overlay",
    legacyLocalStorageKey: "mouse_camera_position",
  },
  {
    key: "hardware.arHudEnabled",
    category: "hardware",
    default: false,
    description: "When true, render the AR HUD overlay (attitude/altitude/heading) on the camera feed",
    legacyLocalStorageKey: "mouse_ar_hud_enabled",
  },

  // ── Navigation / Map ─────────────────────────────────────────────────
  {
    key: "navigation.baseLocation",
    category: "navigation",
    default: null,
    description: "Default operator base location {lat,lng,name,altitude} for map centering",
    legacyLocalStorageKey: "mouse_base_location",
  },
  {
    key: "navigation.mapCenter",
    category: "navigation",
    default: null,
    description: "Last-known map center used to restore view on reload",
    legacyLocalStorageKey: "mouse_map_center",
  },
  {
    key: "navigation.airspaceDisplayRangeMiles",
    category: "navigation",
    default: 25,
    description: "FAA / airspace overlay display radius in miles",
    legacyLocalStorageKey: "mouse_airspace_display_range_miles",
  },
  {
    key: "navigation.gpsDeniedConfig",
    category: "navigation",
    default: null,
    description: "GPS-denied navigation: VIO/optical-flow tuning",
    legacyLocalStorageKey: "mouse_gps_denied_config",
  },
  {
    key: "navigation.mlNavConfig",
    category: "navigation",
    default: null,
    description: "ML autonomous navigation tuning",
    legacyLocalStorageKey: "mouse_ml_nav_config",
  },

  // ── Stabilization ────────────────────────────────────────────────────
  {
    key: "stabilization.mlConfig",
    category: "stabilization",
    default: { enabled: false, mode: "balanced", aggressiveness: 0.5 },
    description: "ML stabilization engine config (also auto-engaged by SensorAnomalyMonitor)",
    legacyLocalStorageKey: "mouse_ml_stabilization_config",
  },
  {
    key: "stabilization.userDisabledAt",
    category: "stabilization",
    default: 0,
    description:
      "Epoch ms when the operator manually disabled ML stabilization. SensorAnomalyMonitor uses this to suppress auto-engage for a cool-down window.",
    legacyLocalStorageKey: "mouse_ml_stabilization_user_disabled_at",
  },

  // ── Inputs ───────────────────────────────────────────────────────────
  {
    key: "inputs.settings",
    category: "inputs",
    default: null,
    description: "Gamepad/joystick/keyboard mapping + dead-zones + invert flags",
    legacyLocalStorageKey: "mouse_input_settings",
  },

  // ── Telemetry ────────────────────────────────────────────────────────
  {
    key: "telemetry.simEnabled",
    category: "telemetry",
    default: false,
    description: "When true, the GCS injects synthetic telemetry for offline demos",
    legacyLocalStorageKey: "mouse_enable_telemetry_sim",
  },

  // ── Geofence (legacy local cache; authoritative storage is per-drone) ─
  {
    key: "geofence.localCache",
    category: "geofence",
    default: null,
    description:
      "Legacy local cache of geofence zones used before per-drone storage existed; preserved for offline rendering",
    legacyLocalStorageKey: "mouse_geofence_zones",
  },

  // ── Comms ────────────────────────────────────────────────────────────
  {
    key: "comms.rtdbPrimary",
    category: "comms",
    default: true,
    description:
      "When true, the communication board treats Firebase Realtime DB as the primary cloud datastore for messages: every send is persisted at /messages/<id> in RTDB. Postgres is the local-system-of-record; Firestore is a long-term audit mirror.",
  },
  {
    key: "comms.archive.firestoreFootage",
    category: "comms",
    default: true,
    description:
      "Archive captured photos / video segments + flight logs to Firestore + Firebase Storage as the primary record (Drive remains a secondary mirror).",
  },
] as const;

export type AppConfigSnapshot = Record<string, unknown>;

/** Build a defaults-only snapshot. Useful as the SSR/initial value on the client. */
export function appConfigDefaults(): AppConfigSnapshot {
  const out: AppConfigSnapshot = {};
  for (const e of APP_CONFIG_KEYS) out[e.key] = e.default;
  return out;
}

export function appConfigKey(key: string): AppConfigKey | undefined {
  return APP_CONFIG_KEYS.find((k) => k.key === key);
}

export const APP_CONFIG_CATEGORY = "appConfig" as const;
