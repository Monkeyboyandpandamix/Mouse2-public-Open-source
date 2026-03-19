import { getDb } from "../db/client.js";

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
    return rows.map(rowToRecipe);
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
