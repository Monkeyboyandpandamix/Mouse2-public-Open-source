import { getDb } from "../db/client.js";

export type MissionRunStatus =
  | "queued"
  | "uploading"
  | "arming"
  | "starting"
  | "running"
  | "completed"
  | "stopped"
  | "failed";

export interface MissionRunRecord {
  id: string;
  missionId: string;
  status: MissionRunStatus;
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
  droneId?: string | null;
  progress?: number;
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

export class MissionExecutionService {
  private get db() {
    return getDb();
  }

  createRun(record: Omit<MissionRunRecord, "id" | "createdAt" | "updatedAt">): MissionRunRecord {
    const id = generateId();
    const now = new Date().toISOString();
    const r: MissionRunRecord = {
      id,
      ...record,
      createdAt: now,
      updatedAt: now,
      commandIds: record.commandIds ?? [],
    };
    this.db
      .prepare(
        `INSERT INTO mission_runs (id, missionId, droneId, status, progress, startedAt, completedAt, error, createdAt, updatedAt,
          connectionString, commandIds, expectedCompletionAt, completionSource, waypointCount, currentWaypointIndex, progressUpdatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        record.missionId,
        (record as any).droneId ?? null,
        record.status,
        (record as any).progress ?? 0,
        now,
        record.completedAt ?? null,
        record.error ?? null,
        now,
        now,
        record.connectionString ?? "",
        JSON.stringify(record.commandIds ?? []),
        record.expectedCompletionAt ?? null,
        record.completionSource ?? null,
        record.waypointCount ?? null,
        record.currentWaypointIndex ?? null,
        record.progressUpdatedAt ?? null
      );
    return r;
  }

  getRun(id: string): MissionRunRecord | undefined {
    const row = this.db.prepare("SELECT * FROM mission_runs WHERE id = ?").get(id) as any;
    return row ? rowToRecord(row) : undefined;
  }

  updateRun(id: string, updates: Partial<MissionRunRecord>): MissionRunRecord | undefined {
    const existing = this.getRun(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `UPDATE mission_runs SET status = ?, error = ?, updatedAt = ?, completedAt = ?, completionSource = ?,
          waypointCount = ?, currentWaypointIndex = ?, progressUpdatedAt = ?, commandIds = ?, expectedCompletionAt = ?, progress = ?
          WHERE id = ?`
      )
      .run(
        updated.status,
        updated.error ?? null,
        updated.updatedAt,
        updated.completedAt ?? null,
        updated.completionSource ?? null,
        updated.waypointCount ?? null,
        updated.currentWaypointIndex ?? null,
        updated.progressUpdatedAt ?? null,
        JSON.stringify(updated.commandIds ?? []),
        updated.expectedCompletionAt ?? null,
        (updated as any).progress ?? 0,
        id
      );
    return updated;
  }

  getAllRuns(): MissionRunRecord[] {
    const rows = this.db.prepare("SELECT * FROM mission_runs ORDER BY createdAt DESC").all() as any[];
    return rows.map(rowToRecord);
  }

  getActiveRuns(): MissionRunRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM mission_runs WHERE status IN ('queued','uploading','arming','starting','running') ORDER BY createdAt DESC"
      )
      .all() as any[];
    return rows.map(rowToRecord);
  }

  recoverInterruptedRuns(): void {
    const restartedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE mission_runs SET status = 'failed', error = COALESCE(error, 'Mission run interrupted by server restart'), updatedAt = ?
          WHERE status IN ('uploading','arming','starting','running','queued')`
      )
      .run(restartedAt);
  }
}

function rowToRecord(r: any): MissionRunRecord {
  return {
    id: r.id,
    missionId: r.missionId,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    connectionString: r.connectionString ?? "",
    commandIds: parseJson<string[]>(r.commandIds) ?? [],
    expectedCompletionAt: r.expectedCompletionAt,
    completedAt: r.completedAt,
    completionSource: r.completionSource,
    waypointCount: r.waypointCount,
    currentWaypointIndex: r.currentWaypointIndex,
    progressUpdatedAt: r.progressUpdatedAt,
    droneId: r.droneId,
    progress: r.progress,
  };
}
