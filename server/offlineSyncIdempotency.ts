import path from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export interface SyncItemKey {
  clientRequestId: string;
}

export interface SyncResultRecord {
  status: "synced" | "failed" | "duplicate";
  error?: string;
}

const UUID_V4_OR_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_DIR = path.resolve(process.cwd(), "data");
const IDEMPOTENCY_FILE = path.join(DATA_DIR, "offline_sync_idempotency.json");

export function normalizeClientRequestId(raw: unknown): string {
  const value = String(raw || "").trim().toLowerCase();
  if (!UUID_V4_OR_V7.test(value)) {
    throw new Error("clientRequestId must be a UUID");
  }
  return value;
}

export class OfflineSyncIdempotencyStore {
  private readonly results = new Map<string, SyncResultRecord>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (!existsSync(IDEMPOTENCY_FILE)) return;
      const raw = readFileSync(IDEMPOTENCY_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      Object.entries(parsed).forEach(([key, value]) => {
        const record = value as SyncResultRecord;
        if (!record || typeof record !== "object") return;
        const status = String(record.status || "").trim();
        if (!["synced", "failed", "duplicate"].includes(status)) return;
        this.results.set(key, {
          status: status as SyncResultRecord["status"],
          error: record.error ? String(record.error) : undefined,
        });
      });
    } catch {
      // Ignore corrupted persistence and continue with empty in-memory map.
    }
  }

  private persistToDisk() {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const payload = Object.fromEntries(this.results.entries());
      writeFileSync(IDEMPOTENCY_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch {
      // non-fatal
    }
  }

  private schedulePersist() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.persistToDisk();
    }, 150);
  }

  get(clientRequestId: string): SyncResultRecord | null {
    return this.results.get(clientRequestId) || null;
  }

  set(clientRequestId: string, result: SyncResultRecord) {
    this.results.set(clientRequestId, result);
    this.schedulePersist();
  }
}
