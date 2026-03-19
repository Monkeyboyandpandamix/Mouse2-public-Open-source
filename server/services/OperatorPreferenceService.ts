import { getDb } from "../db/client.js";

export interface OperatorPreferences {
  userId: string;
  selectedDroneId: string | null;
  cameraSettings: Record<string, unknown> | null;
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

export class OperatorPreferenceService {
  private get db() {
    return getDb();
  }

  getPreferences(userId: string): OperatorPreferences | undefined {
    const row = this.db.prepare("SELECT * FROM operator_preferences WHERE userId = ?").get(userId) as any;
    if (!row) return undefined;
    return {
      userId: row.userId,
      selectedDroneId: row.selectedDroneId,
      cameraSettings: parseJson(row.cameraSettings) ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  getSelectedDrone(userId: string): string | null {
    const prefs = this.getPreferences(userId);
    return prefs?.selectedDroneId ?? null;
  }

  setSelectedDrone(userId: string, droneId: string | null): OperatorPreferences {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT id FROM operator_preferences WHERE userId = ?").get(userId) as any;
    if (existing) {
      this.db.prepare("UPDATE operator_preferences SET selectedDroneId = ?, updatedAt = ? WHERE userId = ?").run(droneId, now, userId);
      return this.getPreferences(userId)!;
    }
    const id = generateId();
    this.db
      .prepare("INSERT INTO operator_preferences (id, userId, selectedDroneId, cameraSettings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, droneId, null, now, now);
    return this.getPreferences(userId)!;
  }

  updatePreferences(userId: string, updates: Partial<Pick<OperatorPreferences, "selectedDroneId" | "cameraSettings">>): OperatorPreferences {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT id FROM operator_preferences WHERE userId = ?").get(userId) as any;
    if (existing) {
      const updatesql: string[] = [];
      const params: unknown[] = [];
      if (updates.selectedDroneId !== undefined) {
        updatesql.push("selectedDroneId = ?");
        params.push(updates.selectedDroneId);
      }
      if (updates.cameraSettings !== undefined) {
        updatesql.push("cameraSettings = ?");
        params.push(JSON.stringify(updates.cameraSettings));
      }
      updatesql.push("updatedAt = ?");
      params.push(now);
      params.push(userId);
      this.db.prepare(`UPDATE operator_preferences SET ${updatesql.join(", ")} WHERE userId = ?`).run(...params);
      return this.getPreferences(userId)!;
    }
    const id = generateId();
    this.db
      .prepare("INSERT INTO operator_preferences (id, userId, selectedDroneId, cameraSettings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, updates.selectedDroneId ?? null, updates.cameraSettings ? JSON.stringify(updates.cameraSettings) : null, now, now);
    return this.getPreferences(userId)!;
  }
}
