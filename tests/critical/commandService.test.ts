import test from "node:test";
import assert from "node:assert/strict";
import { CommandService } from "../../server/commandService";

test("CommandService transitions to acked on successful acknowledged execution", async () => {
  const service = new CommandService();
  const command = await service.dispatchAndWait(
    {
      type: "arm",
      payload: {},
      requestedBy: { userId: "u1", role: "operator", name: "Op" },
      timeoutMs: 5000,
    },
    async () => ({ ok: true, acknowledged: true, result: { ack: 0 } }),
  );

  assert.equal(command.status, "acked");
  assert.ok(command.sentAt);
  assert.ok(command.ackedAt);
  assert.equal(command.history[0].status, "queued");
  assert.equal(command.history[1].status, "sent");
  assert.equal(command.history[2].status, "acked");
});

test("CommandService transitions to failed when executor returns failure", async () => {
  const service = new CommandService();
  const command = await service.dispatchAndWait(
    {
      type: "rtl",
      payload: {},
      requestedBy: { userId: "u2", role: "operator", name: "Op2" },
      timeoutMs: 5000,
    },
    async () => ({ ok: false, acknowledged: false, error: "boom" }),
  );

  assert.equal(command.status, "failed");
  assert.equal(command.error, "boom");
  assert.ok(command.failedAt);
});

test("CommandService transitions to timed_out when execution exceeds timeout", async () => {
  const service = new CommandService();
  const command = await service.dispatchAndWait(
    {
      type: "land",
      payload: {},
      requestedBy: { userId: "u3", role: "operator", name: "Op3" },
      timeoutMs: 500,
    },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { ok: true, acknowledged: true };
    },
  );

  assert.equal(command.status, "timed_out");
  assert.ok(command.timedOutAt);
});
