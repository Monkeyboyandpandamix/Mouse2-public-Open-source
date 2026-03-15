import { randomBytes } from "crypto";

export type CommandLifecycleStatus = "queued" | "sent" | "acked" | "failed" | "timed_out";

export interface CommandHistoryEntry {
  status: CommandLifecycleStatus;
  at: string;
  note?: string;
}

export interface CommandRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: CommandLifecycleStatus;
  timeoutMs: number;
  queuedAt: string;
  sentAt?: string;
  ackedAt?: string;
  failedAt?: string;
  timedOutAt?: string;
  error?: string;
  result?: unknown;
  requestedBy: {
    userId: string;
    role: string;
    name: string;
  };
  history: CommandHistoryEntry[];
}

export interface CommandDispatchInput {
  type: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
  requestedBy: {
    userId: string;
    role: string;
    name: string;
  };
}

export interface CommandExecutionResult {
  ok: boolean;
  acknowledged?: boolean;
  result?: unknown;
  error?: string;
}

const MAX_HISTORY = 1000;
const DEFAULT_TIMEOUT_MS = 12_000;

export class CommandService {
  private readonly commands = new Map<string, CommandRecord>();

  private transition(record: CommandRecord, status: CommandLifecycleStatus, note?: string) {
    const now = new Date().toISOString();
    record.status = status;
    record.history.push({ status, at: now, note });
    if (status === "sent") record.sentAt = now;
    if (status === "acked") record.ackedAt = now;
    if (status === "failed") record.failedAt = now;
    if (status === "timed_out") record.timedOutAt = now;
  }

  private trim() {
    if (this.commands.size <= MAX_HISTORY) return;
    const oldest = this.commands.keys().next().value;
    if (oldest) this.commands.delete(oldest);
  }

  list(limit = 100): CommandRecord[] {
    const max = Math.max(1, Math.min(500, Number(limit) || 100));
    return Array.from(this.commands.values()).slice(-max).reverse();
  }

  get(commandId: string): CommandRecord | null {
    return this.commands.get(commandId) || null;
  }

  async dispatchAndWait(
    input: CommandDispatchInput,
    executor: (record: CommandRecord) => Promise<CommandExecutionResult>,
  ): Promise<CommandRecord> {
    const now = new Date().toISOString();
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const timeoutMs = Math.max(500, Math.min(60_000, Number(input.timeoutMs || DEFAULT_TIMEOUT_MS)));

    const record: CommandRecord = {
      id,
      type: String(input.type || "unknown"),
      payload: input.payload || {},
      status: "queued",
      timeoutMs,
      queuedAt: now,
      requestedBy: input.requestedBy,
      history: [{ status: "queued", at: now }],
    };

    this.commands.set(id, record);
    this.trim();

    this.transition(record, "sent");

    const timedOutResult: CommandExecutionResult = {
      ok: false,
      acknowledged: false,
      error: `Command timed out after ${timeoutMs}ms`,
    };

    const result = await Promise.race([
      executor(record),
      new Promise<CommandExecutionResult>((resolve) => {
        setTimeout(() => resolve(timedOutResult), timeoutMs);
      }),
    ]);

    if (result === timedOutResult) {
      record.error = timedOutResult.error;
      this.transition(record, "timed_out", timedOutResult.error);
      return record;
    }

    if (result.ok && result.acknowledged !== false) {
      record.result = result.result ?? null;
      this.transition(record, "acked");
      return record;
    }

    record.error = String(result.error || "Command execution failed");
    record.result = result.result ?? null;
    this.transition(record, "failed", record.error);
    return record;
  }
}
