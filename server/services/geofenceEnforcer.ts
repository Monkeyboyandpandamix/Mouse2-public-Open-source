import { spawn } from "child_process";
import path from "path";
import { storage } from "../storage.js";

interface CircleZone {
  type: "circle";
  enabled: boolean;
  center: { lat: number; lng: number };
  radiusMeters: number;
  altitudeMin: number | null;
  altitudeMax: number | null;
  action: "warn" | "rtl" | "land" | "hover";
  name: string;
  id: string;
}

interface PolygonZone {
  type: "polygon";
  enabled: boolean;
  points: Array<{ lat: number; lng: number }>;
  altitudeMin: number | null;
  altitudeMax: number | null;
  action: "warn" | "rtl" | "land" | "hover";
  name: string;
  id: string;
}

type Zone = CircleZone | PolygonZone;

interface Position {
  lat: number;
  lng: number;
  altitude?: number | null;
}

interface BreachResult {
  zone: Zone;
  reason: "outside_inclusion" | "altitude_floor" | "altitude_ceiling";
}

const HAVERSINE_R = 6371000;

function haversine(a: Position, b: { lat: number; lng: number }): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const c = sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  return 2 * HAVERSINE_R * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function pointInPolygon(p: Position, poly: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat;
    const xj = poly[j].lng, yj = poly[j].lat;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function evaluateZone(pos: Position, zone: Zone): BreachResult | null {
  if (!zone || zone.enabled === false) return null;
  let inside = false;
  if (zone.type === "circle" && zone.center && Number.isFinite(zone.radiusMeters)) {
    inside = haversine(pos, zone.center) <= zone.radiusMeters;
  } else if (zone.type === "polygon" && Array.isArray(zone.points) && zone.points.length >= 3) {
    inside = pointInPolygon(pos, zone.points);
  } else {
    return null;
  }
  // Inclusion zones (the typical case in this app's UI) are breached when the
  // drone is OUTSIDE the boundary.
  if (!inside) {
    return { zone, reason: "outside_inclusion" };
  }
  // Altitude floor/ceiling within an inclusion zone
  if (pos.altitude != null) {
    if (zone.altitudeMin != null && pos.altitude < zone.altitudeMin) {
      return { zone, reason: "altitude_floor" };
    }
    if (zone.altitudeMax != null && pos.altitude > zone.altitudeMax) {
      return { zone, reason: "altitude_ceiling" };
    }
  }
  return null;
}

function pickNumber(...vals: any[]): number | null {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Normalize the heterogenous geofence shapes used across this app:
 *   - GeofencingPanel writes `{type: "circle"|"custom"|"polygon", radius, minAltitude, maxAltitude}`
 *   - Other surfaces may write `{radiusMeters, altitudeMin, altitudeMax}`
 *   - Legacy "polygon" is treated identically to "custom"
 */
function normalizeZones(raw: unknown): Zone[] {
  if (!Array.isArray(raw)) return [];
  const out: Zone[] = [];
  for (const item of raw as any[]) {
    if (!item || typeof item !== "object") continue;
    const enabled = item.enabled !== false;
    const action = (String(item.action || "rtl").toLowerCase() as Zone["action"]) || "rtl";
    const altitudeMin = pickNumber(item.altitudeMin, item.minAltitude);
    const altitudeMax = pickNumber(item.altitudeMax, item.maxAltitude);
    const id = String(item.id || item.name || `${item.type}-${out.length}`);
    const name = String(item.name || "Unnamed zone");
    const typeStr = String(item.type || "").toLowerCase();

    if (typeStr === "circle" && item.center) {
      const radiusMeters = pickNumber(item.radiusMeters, item.radius);
      if (radiusMeters == null || radiusMeters <= 0) continue;
      out.push({
        type: "circle",
        enabled,
        center: { lat: Number(item.center.lat), lng: Number(item.center.lng) },
        radiusMeters,
        altitudeMin,
        altitudeMax,
        action,
        name,
        id,
      });
    } else if ((typeStr === "polygon" || typeStr === "custom") && Array.isArray(item.points)) {
      const points = item.points
        .filter((p: any) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
        .map((p: any) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
      if (points.length < 3) continue;
      out.push({
        type: "polygon",
        enabled,
        points,
        altitudeMin,
        altitudeMax,
        action,
        name,
        id,
      });
    }
  }
  return out;
}

// Per-drone breach state: tracks which zone the drone is currently breaching
// so we only emit the WS event/dispatch action on edge transitions, not every
// telemetry frame.
interface BreachState {
  zoneId: string;
  reason: BreachResult["reason"];
  enteredAt: number;
  lastActionAt: number;
}
const activeBreaches = new Map<string, BreachState>();
const ACTION_COOLDOWN_MS = 30_000; // re-fire RTL/land at most every 30s while the breach persists

function dispatchAction(droneId: string, connectionString: string, action: "rtl" | "land"): void {
  // mavlink_vehicle_control.py uses argv (not shell), so quoting in the
  // connection string is safe; we still allowlist the command name.
  try {
    const script = path.resolve(process.cwd(), "scripts", "mavlink_vehicle_control.py");
    const child = spawn("python3", [script, action, "--connection", connectionString], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err) => console.warn(`[geofence] dispatch ${action} spawn error:`, err.message));
    child.unref();
    console.log(`[geofence] dispatched ${action.toUpperCase()} for drone ${droneId} via ${connectionString}`);
  } catch (err: any) {
    console.warn(`[geofence] dispatch ${action} failed:`, err?.message);
  }
}

export interface GeofenceCheckOpts {
  droneId: string;
  position: Position;
  broadcast: (type: string, data: any) => void;
  /**
   * Whether the originating request is allowed to dispatch flight-control
   * actions (RTL/land). Telemetry posted by an unauthenticated browser or a
   * user without the `flight_control` permission produces only an advisory
   * `geofence_breach` broadcast — no MAVLink command is sent.
   */
  canDispatchActions?: boolean;
}

/**
 * Per-frame geofence check. Resolves the drone's configured zones from storage
 * (geofenceData JSON column on the drone row) and dispatches the configured
 * action (default RTL) when a breach is detected. Uses per-drone hysteresis so
 * the WS event fires once on enter, again on action repeat (every 30s if still
 * breached), and once with `cleared:true` when the drone returns inside.
 */
export async function enforceGeofence(opts: GeofenceCheckOpts): Promise<void> {
  const { droneId, position, broadcast, canDispatchActions = false } = opts;
  if (!droneId || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;
  let drone: any;
  try {
    drone = await storage.getDrone(droneId);
  } catch {
    return;
  }
  if (!drone || drone.geofenceEnabled === false) return;
  const zones = normalizeZones(drone.geofenceData);
  if (zones.length === 0) {
    activeBreaches.delete(droneId);
    return;
  }

  let firstBreach: BreachResult | null = null;
  for (const zone of zones) {
    const result = evaluateZone(position, zone);
    if (result) {
      firstBreach = result;
      break;
    }
  }

  const now = Date.now();
  const existing = activeBreaches.get(droneId);

  if (!firstBreach) {
    // Cleared: emit a one-shot "cleared" event if we were previously breaching.
    if (existing) {
      activeBreaches.delete(droneId);
      broadcast("geofence_breach", {
        droneId,
        cleared: true,
        zoneId: existing.zoneId,
        position,
        ts: now,
      });
    }
    return;
  }

  const action = firstBreach.zone.action || "rtl";
  const isNewBreach = !existing || existing.zoneId !== firstBreach.zone.id;
  const cooldownExpired = !!existing && now - existing.lastActionAt >= ACTION_COOLDOWN_MS;

  if (isNewBreach || cooldownExpired) {
    const payload = {
      droneId,
      action,
      reason: firstBreach.reason,
      zoneId: firstBreach.zone.id,
      zoneName: firstBreach.zone.name,
      position,
      authorized: !!canDispatchActions,
      dispatched: false as boolean,
      ts: now,
    };

    if (canDispatchActions && (action === "rtl" || action === "land")) {
      const conn = String(drone.connectionString || drone.connection || "").trim();
      if (conn) {
        dispatchAction(droneId, conn, action);
        payload.dispatched = true;
      }
    }
    broadcast("geofence_breach", payload);

    activeBreaches.set(droneId, {
      zoneId: firstBreach.zone.id,
      reason: firstBreach.reason,
      enteredAt: existing?.enteredAt ?? now,
      lastActionAt: now,
    });
  }
}

/** Test/visibility helper — clear all active breach state. */
export function clearAllGeofenceState(): void {
  activeBreaches.clear();
}
