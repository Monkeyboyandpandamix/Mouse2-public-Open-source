import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildPluginToolSpawnSpec } from "../../server/pluginToolRunner";

test("plugin runner rejects legacy shell command tools", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mouse-plugin-"));
  const pluginsDir = path.join(temp, "plugins");
  fs.mkdirSync(path.join(pluginsDir, "safe"), { recursive: true });

  assert.throws(
    () =>
      buildPluginToolSpawnSpec({
        pluginsDir,
        pluginId: "safe",
        tool: { id: "legacy", command: "echo pwned" },
        userArgs: [],
      }),
    /Legacy shell command tools are disabled/i,
  );
});

test("plugin runner builds safe bash spawn spec for plugin-local script", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mouse-plugin-"));
  const pluginsDir = path.join(temp, "plugins");
  const pluginDir = path.join(pluginsDir, "safe");
  const toolsDir = path.join(pluginDir, "tools");
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(path.join(toolsDir, "hello.sh"), "#!/bin/sh\necho ok\n", "utf8");

  const spec = buildPluginToolSpawnSpec({
    pluginsDir,
    pluginId: "safe",
    tool: {
      id: "hello",
      exec: "bash",
      args: ["tools/hello.sh"],
      allowUserArgs: false,
    },
    userArgs: [],
  });

  assert.equal(spec.command, "bash");
  assert.equal(spec.cwd, pluginDir);
  assert.equal(spec.args.length, 1);
  assert.ok(spec.args[0].startsWith(pluginDir));
});

test("plugin runner rejects non-allowlisted executables", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mouse-plugin-"));
  const pluginsDir = path.join(temp, "plugins");
  fs.mkdirSync(path.join(pluginsDir, "safe"), { recursive: true });

  assert.throws(
    () =>
      buildPluginToolSpawnSpec({
        pluginsDir,
        pluginId: "safe",
        tool: { id: "bad", exec: "zsh", args: [] },
        userArgs: [],
      }),
    /not allowlisted/i,
  );
});
