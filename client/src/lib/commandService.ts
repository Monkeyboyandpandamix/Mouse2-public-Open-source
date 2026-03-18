import { readStoredSelectedDrone } from "@/lib/clientState";

export interface DispatchCommandOptions {
  commandType: string;
  payload?: Record<string, unknown>;
  connectionString?: string;
  timeoutMs?: number;
  requireConnection?: boolean;
}

function selectedDroneConnectionString() {
  const parsed = readStoredSelectedDrone<{ connectionString?: string }>();
  return String(parsed?.connectionString || "").trim();
}

export async function dispatchBackendCommand(options: DispatchCommandOptions) {
  const commandType = String(options.commandType || "").trim().toLowerCase();
  if (!commandType) {
    throw new Error("commandType is required");
  }

  const connectionString = String(options.connectionString || selectedDroneConnectionString() || "").trim();
  if (options.requireConnection !== false && !connectionString) {
    throw new Error("No active drone connection string configured");
  }

  const response = await fetch("/api/commands/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandType,
      payload: options.payload || {},
      connectionString,
      timeoutMs: Number(options.timeoutMs || 12000),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Command dispatch failed (${response.status})`);
  }

  const status = String(data?.command?.status || "");
  if (status !== "acked") {
    throw new Error(data?.command?.error || `Command ended with status: ${status || "unknown"}`);
  }

  window.dispatchEvent(
    new CustomEvent("command-acked", {
      detail: {
        commandType,
        command: data.command,
      },
    }),
  );

  return data.command;
}
