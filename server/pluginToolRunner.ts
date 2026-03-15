import path from "path";
import { existsSync } from "fs";

const ALLOWED_EXECUTABLES = new Set(["python3", "node", "bash", "sh"]);
const SAFE_PLUGIN_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export interface PluginSpawnSpec {
  command: string;
  args: string[];
  cwd: string;
}

function assertSafePath(baseDir: string, candidate: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedCandidate = path.resolve(candidate);
  if (!resolvedCandidate.startsWith(`${resolvedBase}${path.sep}`) && resolvedCandidate !== resolvedBase) {
    throw new Error("Path escapes plugin directory");
  }
  return resolvedCandidate;
}

function normalizeArgs(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("args must be an array of strings");
  }
  const out = raw.map((v) => String(v ?? "").trim());
  for (const arg of out) {
    if (!arg) throw new Error("args cannot include empty values");
    if (arg.includes("\u0000")) throw new Error("args cannot include null bytes");
    if (arg.length > 200) throw new Error("args value too long");
  }
  return out;
}

export function normalizePluginId(raw: unknown): string {
  const id = String(raw || "").trim();
  if (!SAFE_PLUGIN_ID.test(id)) {
    throw new Error("Invalid plugin id");
  }
  return id;
}

export function buildPluginToolSpawnSpec(opts: {
  pluginsDir: string;
  pluginId: string;
  tool: any;
  userArgs: unknown;
}): PluginSpawnSpec {
  const pluginId = normalizePluginId(opts.pluginId);
  const pluginDir = assertSafePath(opts.pluginsDir, path.join(opts.pluginsDir, pluginId));

  const tool = opts.tool || {};
  if (tool.command && !tool.exec) {
    throw new Error("Legacy shell command tools are disabled. Use tool.exec + tool.args.");
  }

  const execRaw = String(tool.exec || "").trim();
  if (!execRaw) {
    throw new Error("Tool exec is required");
  }

  const baseArgs = normalizeArgs(tool.args);
  const userArgs = normalizeArgs(opts.userArgs);
  if (userArgs.length && tool.allowUserArgs !== true) {
    throw new Error("Tool does not allow runtime args");
  }

  let command = execRaw;
  if (execRaw.includes("/") || execRaw.startsWith(".")) {
    command = assertSafePath(pluginDir, path.resolve(pluginDir, execRaw));
    if (!existsSync(command)) {
      throw new Error("Tool executable not found");
    }
  } else {
    if (!ALLOWED_EXECUTABLES.has(execRaw)) {
      throw new Error(`Executable '${execRaw}' is not allowlisted`);
    }
  }

  const finalArgs = [...baseArgs, ...userArgs];

  if ((command === "bash" || command === "sh") && finalArgs.length > 0) {
    const scriptPath = assertSafePath(pluginDir, path.resolve(pluginDir, finalArgs[0]));
    if (!existsSync(scriptPath)) {
      throw new Error("Shell script not found in plugin directory");
    }
    finalArgs[0] = scriptPath;
  }

  if ((command === "node" || command === "python3") && finalArgs.length > 0 && (finalArgs[0].includes("/") || finalArgs[0].startsWith("."))) {
    const scriptPath = assertSafePath(pluginDir, path.resolve(pluginDir, finalArgs[0]));
    if (!existsSync(scriptPath)) {
      throw new Error("Script not found in plugin directory");
    }
    finalArgs[0] = scriptPath;
  }

  return {
    command,
    args: finalArgs,
    cwd: pluginDir,
  };
}
