import { getDb } from "../db/client.js";

const DEFAULT_RECIPE_NAMES = [
  "Auto-RTL on Low Battery",
  "Photo at Waypoint",
  "GPS Denied Navigation",
] as const;

export interface AutomationRunRecord {
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
  requestedBy: { userId: string; role: string; name: string };
}

export interface AutomationRecipe {
  id: string;
  userId: string;
  name: string;
  description?: string;
  trigger: string;
  code: string;
  enabled: boolean;
  lastRun?: string | null;
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseJson<T>(val: string | null): T | undefined {
  if (!val) return undefined;
  try {
    return JSON.parse(val) as T;
  } catch {
    return undefined;
  }
}

export class AutomationService {
  private get db() {
    return getDb();
  }

  createRun(record: Omit<AutomationRunRecord, "id" | "createdAt" | "updatedAt">): AutomationRunRecord {
    const id = generateId();
    const now = new Date().toISOString();
    const r: AutomationRunRecord = { id, ...record, createdAt: now, updatedAt: now };
    this.db
      .prepare(
        `INSERT INTO automation_runs (id, recipeId, scriptId, scriptName, trigger, reason, status, error, result, commandId, requestedBy, startedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        record.scriptId,
        record.scriptId,
        record.scriptName,
        record.trigger,
        record.reason,
        record.status,
        record.error ?? null,
        JSON.stringify(record.result ?? null),
        record.commandId ?? null,
        JSON.stringify(record.requestedBy),
        now,
        now,
        now
      );
    return r;
  }

  getRun(id: string): AutomationRunRecord | undefined {
    const row = this.db.prepare("SELECT * FROM automation_runs WHERE id = ?").get(id) as any;
    return row ? rowToRunRecord(row) : undefined;
  }

  updateRun(id: string, updates: Partial<AutomationRunRecord>): AutomationRunRecord | undefined {
    const existing = this.getRun(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `UPDATE automation_runs SET status = ?, error = ?, result = ?, commandId = ?, completedAt = ?, updatedAt = ? WHERE id = ?`
      )
      .run(
        updated.status,
        updated.error ?? null,
        JSON.stringify(updated.result ?? null),
        updated.commandId ?? null,
        updated.status === "completed" || updated.status === "failed" ? updated.updatedAt : null,
        updated.updatedAt,
        id
      );
    return updated;
  }

  getAllRuns(): AutomationRunRecord[] {
    const rows = this.db.prepare("SELECT * FROM automation_runs ORDER BY createdAt DESC").all() as any[];
    return rows.map(rowToRunRecord);
  }

  getRecipes(userId?: string): AutomationRecipe[] {
    const rows = userId
      ? (this.db.prepare("SELECT * FROM automation_recipes WHERE userId = ? ORDER BY createdAt DESC").all(userId) as any[])
      : (this.db.prepare("SELECT * FROM automation_recipes ORDER BY createdAt DESC").all() as any[]);
    if (userId) {
      // Backfill any missing default recipes (by name). Existing users created before
      // the defaults shipped also get the three required entries on next read.
      const haveNames = new Set(rows.map((r) => String(r.name || "")));
      const missing = DEFAULT_RECIPE_NAMES.filter((n) => !haveNames.has(n));
      if (rows.length === 0 || missing.length > 0) {
        this.seedDefaultRecipes(userId, missing.length > 0 && rows.length > 0 ? missing : undefined);
        const seeded = this.db
          .prepare("SELECT * FROM automation_recipes WHERE userId = ? ORDER BY createdAt DESC")
          .all(userId) as any[];
        return seeded.map(rowToRecipe);
      }
    }
    return rows.map(rowToRecipe);
  }

  private seedDefaultRecipes(userId: string, onlyNames?: string[]): void {
    const defaults: Array<Omit<AutomationRecipe, "id" | "createdAt" | "updatedAt" | "userId">> = [
      {
        name: "Auto-RTL on Low Battery",
        description: "Triggers a return-to-launch when battery drops below 25% to safeguard the airframe.",
        trigger: "battery_low",
        enabled: true,
        code: [
          "// Auto Return-To-Launch on Low Battery",
          "// Inputs: telemetry.batteryPercent (0-100)",
          "if (telemetry.batteryPercent <= 25 && telemetry.armed) {",
          "  await drone.broadcast('Battery critical — initiating Return-To-Launch');",
          "  await drone.command({ type: 'rtl' });",
          "  return { ok: true, action: 'rtl', reason: `Battery ${telemetry.batteryPercent}%` };",
          "}",
          "return { ok: true, action: 'noop' };",
        ].join("\n"),
      },
      {
        name: "Photo at Waypoint",
        description: "Captures a still image and tags it with the waypoint index whenever a waypoint is reached.",
        trigger: "waypoint_reached",
        enabled: true,
        code: [
          "// Capture a photo whenever the vehicle reaches a waypoint",
          "// Inputs: event.waypointIndex, telemetry.latitude, telemetry.longitude, telemetry.altitudeRelative",
          "const tag = `wp-${event.waypointIndex ?? 'unknown'}`;",
          "const photo = await camera.capturePhoto({",
          "  tag,",
          "  metadata: {",
          "    lat: telemetry.latitude,",
          "    lon: telemetry.longitude,",
          "    altRelM: telemetry.altitudeRelative,",
          "    waypoint: event.waypointIndex,",
          "  },",
          "});",
          "return { ok: true, action: 'photo_captured', assetId: photo?.id ?? null };",
        ].join("\n"),
      },
      {
        name: "GPS Denied Navigation",
        description: "Switches to vision-aided LOITER and warns operators when GPS quality degrades.",
        trigger: "gps_lost",
        enabled: true,
        code: [
          "// Fallback navigation strategy when GPS becomes unreliable",
          "// Inputs: telemetry.gpsFixType (0-6), telemetry.satellites, vision.visualOdometryReady",
          "if (telemetry.gpsFixType < 3 || telemetry.satellites < 6) {",
          "  await drone.broadcast('GPS degraded — switching to vision-aided LOITER');",
          "  await drone.command({ type: 'set_mode', payload: { mode: 'LOITER' } });",
          "  if (vision.visualOdometryReady) {",
          "    await drone.command({ type: 'enable_visual_nav', payload: { source: 'optical_flow' } });",
          "  }",
          "  return { ok: true, action: 'gps_denied_fallback', satellites: telemetry.satellites };",
          "}",
          "return { ok: true, action: 'noop' };",
        ].join("\n"),
      },
    ];
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "INSERT INTO automation_recipes (id, userId, name, description, trigger, code, enabled, lastRun, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const wanted = onlyNames && onlyNames.length > 0
      ? defaults.filter((r) => onlyNames.includes(r.name))
      : defaults;
    for (const r of wanted) {
      const id = generateId();
      stmt.run(id, userId, r.name, r.description ?? "", r.trigger, r.code, r.enabled ? 1 : 0, null, now, now);
    }
  }

  getRecipe(id: string): AutomationRecipe | undefined {
    const row = this.db.prepare("SELECT * FROM automation_recipes WHERE id = ?").get(id) as any;
    return row ? rowToRecipe(row) : undefined;
  }

  createRecipe(recipe: Omit<AutomationRecipe, "id" | "createdAt" | "updatedAt">): AutomationRecipe {
    const id = generateId();
    const now = new Date().toISOString();
    const r: AutomationRecipe = { id, ...recipe, enabled: recipe.enabled ?? true, createdAt: now, updatedAt: now };
    const desc = recipe.description ?? "";
    const lastRun = recipe.lastRun ?? null;
    this.db
      .prepare(
        "INSERT INTO automation_recipes (id, userId, name, description, trigger, code, enabled, lastRun, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, recipe.userId, recipe.name, desc, recipe.trigger, recipe.code, recipe.enabled ? 1 : 0, lastRun, now, now);
    return r;
  }

  updateRecipe(id: string, updates: Partial<AutomationRecipe>): AutomationRecipe | undefined {
    const existing = this.getRecipe(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const desc = updated.description ?? "";
    const lastRun = updated.lastRun ?? null;
    this.db
      .prepare(
        "UPDATE automation_recipes SET name = ?, description = ?, trigger = ?, code = ?, enabled = ?, lastRun = ?, updatedAt = ? WHERE id = ?"
      )
      .run(updated.name, desc, updated.trigger, updated.code, updated.enabled ? 1 : 0, lastRun, updated.updatedAt, id);
    return updated;
  }

  deleteRecipe(id: string): void {
    this.db.prepare("DELETE FROM automation_recipes WHERE id = ?").run(id);
  }
}

function rowToRunRecord(r: any): AutomationRunRecord {
  return {
    id: r.id,
    scriptId: r.scriptId ?? r.recipeId ?? "",
    scriptName: r.scriptName ?? "",
    trigger: r.trigger ?? "manual",
    reason: r.reason ?? "",
    status: r.status,
    error: r.error,
    result: parseJson(r.result),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    commandId: r.commandId,
    requestedBy: parseJson(r.requestedBy) ?? { userId: "", role: "viewer", name: "User" },
  };
}

function rowToRecipe(r: any): AutomationRecipe {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    description: r.description ?? "",
    trigger: r.trigger,
    code: r.code,
    enabled: Boolean(r.enabled),
    lastRun: r.lastRun ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
