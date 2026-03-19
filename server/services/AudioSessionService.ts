import { getDb } from "../db/client.js";

export interface AudioSessionState {
  deviceType: "gpio" | "usb" | "buzzer";
  deviceId: string;
  volume: number;
  live: { active: boolean; source: string; startedAt: string | null };
  droneMic: { enabled: boolean; listening: boolean; volume: number; updatedAt: string | null };
  lastTtsAt: string | null;
  lastBuzzerTone: string | null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function parseJson<T>(val: string | null): T | undefined {
  if (!val) return undefined;
  try {
    return JSON.parse(val) as T;
  } catch {
    return undefined;
  }
}

export class AudioSessionService {
  private get db() {
    return getDb();
  }

  getState(): AudioSessionState | undefined {
    const row = this.db.prepare("SELECT * FROM audio_sessions ORDER BY updatedAt DESC LIMIT 1").get() as any;
    if (!row) return undefined;
    return {
      deviceType: (row.deviceType as "gpio" | "usb" | "buzzer") ?? "gpio",
      deviceId: row.deviceId ?? row.outputDevice ?? "gpio-default",
      volume: row.volume ?? 80,
      live: parseJson(row.live) ?? { active: false, source: "operator-mic", startedAt: null },
      droneMic: parseJson(row.droneMic) ?? { enabled: false, listening: false, volume: 70, updatedAt: null },
      lastTtsAt: row.lastTtsAt ?? null,
      lastBuzzerTone: row.lastBuzzerTone ?? null,
    };
  }

  saveState(state: Partial<AudioSessionState>): AudioSessionState {
    const existing = this.getState();
    const merged: AudioSessionState = {
      deviceType: existing?.deviceType ?? "gpio",
      deviceId: existing?.deviceId ?? "gpio-default",
      volume: existing?.volume ?? 80,
      live: existing?.live ?? { active: false, source: "operator-mic", startedAt: null },
      droneMic: existing?.droneMic ?? { enabled: false, listening: false, volume: 70, updatedAt: null },
      lastTtsAt: existing?.lastTtsAt ?? null,
      lastBuzzerTone: existing?.lastBuzzerTone ?? null,
      ...state,
    };
    const now = new Date().toISOString();
    const rows = this.db.prepare("SELECT id FROM audio_sessions LIMIT 1").all() as any[];
    const id = rows[0]?.id ?? generateId();
    if (rows.length === 0) {
      this.db
        .prepare(
          "INSERT INTO audio_sessions (id, outputDevice, liveEnabled, droneMicEnabled, ttsEnabled, deviceType, deviceId, volume, live, droneMic, lastTtsAt, lastBuzzerTone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          merged.deviceId,
          merged.live.active ? 1 : 0,
          merged.droneMic.enabled ? 1 : 0,
          0,
          merged.deviceType,
          merged.deviceId,
          merged.volume,
          JSON.stringify(merged.live),
          JSON.stringify(merged.droneMic),
          merged.lastTtsAt,
          merged.lastBuzzerTone,
          now,
          now
        );
    } else {
      this.db
        .prepare(
          "UPDATE audio_sessions SET outputDevice=?, liveEnabled=?, droneMicEnabled=?, deviceType=?, deviceId=?, volume=?, live=?, droneMic=?, lastTtsAt=?, lastBuzzerTone=?, updatedAt=? WHERE id=?"
        )
        .run(
          merged.deviceId,
          merged.live.active ? 1 : 0,
          merged.droneMic.enabled ? 1 : 0,
          merged.deviceType,
          merged.deviceId,
          merged.volume,
          JSON.stringify(merged.live),
          JSON.stringify(merged.droneMic),
          merged.lastTtsAt,
          merged.lastBuzzerTone,
          now,
          id
        );
    }
    return merged;
  }
}
