import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { normalizeClientRequestId, OfflineSyncIdempotencyStore } from "../../server/offlineSyncIdempotency";

test("normalizeClientRequestId accepts valid UUID", () => {
  const id = normalizeClientRequestId("550e8400-e29b-41d4-a716-446655440000");
  assert.equal(id, "550e8400-e29b-41d4-a716-446655440000");
});

test("normalizeClientRequestId rejects invalid ID", () => {
  assert.throws(() => normalizeClientRequestId("not-a-uuid"), /must be a UUID/i);
});

test("OfflineSyncIdempotencyStore keeps deterministic per-request sync outcome", () => {
  const store = new OfflineSyncIdempotencyStore();
  const id = randomUUID();

  assert.equal(store.get(id), null);
  store.set(id, { status: "synced" });
  assert.deepEqual(store.get(id), { status: "synced" });
});
