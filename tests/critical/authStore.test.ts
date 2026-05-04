import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { authenticateWithPassword } from "../../server/authStore";

test("auth store requires valid username+password pair", () => {
  process.env.DEFAULT_ADMIN_PASSWORD = "admin123";
  fs.rmSync(path.resolve(process.cwd(), "data", "auth_users.json"), { force: true });

  const wrong = authenticateWithPassword("admin", "bad-password");
  assert.equal(wrong, null);

  const ok = authenticateWithPassword("admin", "admin123");
  assert.ok(ok);
  assert.equal(ok?.username, "admin");
  assert.equal(ok?.role, "admin");

  delete process.env.DEFAULT_ADMIN_PASSWORD;
  fs.rmSync(path.resolve(process.cwd(), "data", "auth_users.json"), { force: true });
});
