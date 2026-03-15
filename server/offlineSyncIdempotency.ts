export interface SyncItemKey {
  clientRequestId: string;
}

export interface SyncResultRecord {
  status: "synced" | "failed" | "duplicate";
  error?: string;
}

const UUID_V4_OR_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeClientRequestId(raw: unknown): string {
  const value = String(raw || "").trim().toLowerCase();
  if (!UUID_V4_OR_V7.test(value)) {
    throw new Error("clientRequestId must be a UUID");
  }
  return value;
}

export class OfflineSyncIdempotencyStore {
  private readonly results = new Map<string, SyncResultRecord>();

  get(clientRequestId: string): SyncResultRecord | null {
    return this.results.get(clientRequestId) || null;
  }

  set(clientRequestId: string, result: SyncResultRecord) {
    this.results.set(clientRequestId, result);
  }
}
