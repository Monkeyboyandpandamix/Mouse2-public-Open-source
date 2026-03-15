import test from "node:test";
import assert from "node:assert/strict";
import { authenticateWithPassword } from "../../server/authStore";

test("auth store requires valid username+password pair", () => {
  const wrong = authenticateWithPassword("admin", "bad-password");
  assert.equal(wrong, null);

  const ok = authenticateWithPassword("admin", "admin123");
  assert.ok(ok);
  assert.equal(ok?.username, "admin");
  assert.equal(ok?.role, "admin");
});
