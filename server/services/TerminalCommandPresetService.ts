import { getDb } from "../db/client.js";

export interface TerminalCommandPreset {
  userId: string;
  commands: unknown[];
  updatedAt: string;
}

export class TerminalCommandPresetService {
  private get db() {
    return getDb();
  }

  getPreset(userId: string): TerminalCommandPreset | undefined {
    const row = this.db.prepare("SELECT * FROM terminal_command_presets WHERE userId = ?").get(userId) as any;
    if (!row) return undefined;
    let commands: unknown[] = [];
    try {
      commands = row.commands ? JSON.parse(row.commands) : [];
    } catch {
      commands = [];
    }
    return {
      userId: row.userId,
      commands: Array.isArray(commands) ? commands : [],
      updatedAt: row.updatedAt,
    };
  }

  putPreset(userId: string, commands: unknown[]): TerminalCommandPreset {
    const now = new Date().toISOString();
    const commandsJson = JSON.stringify(Array.isArray(commands) ? commands : []);
    const existing = this.getPreset(userId);
    if (existing) {
      this.db.prepare("UPDATE terminal_command_presets SET commands = ?, updatedAt = ? WHERE userId = ?").run(commandsJson, now, userId);
    } else {
      this.db.prepare("INSERT INTO terminal_command_presets (userId, commands, updatedAt) VALUES (?, ?, ?)").run(userId, commandsJson, now);
    }
    return { userId, commands: JSON.parse(commandsJson), updatedAt: now };
  }

  deletePreset(userId: string): void {
    this.db.prepare("DELETE FROM terminal_command_presets WHERE userId = ?").run(userId);
  }
}
