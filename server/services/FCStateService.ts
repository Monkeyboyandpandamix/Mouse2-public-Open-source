import { getDb } from "../db/client.js";

export interface FCAppliedState {
  droneId: string;
  missionHash: string | null;
  fenceHash: string | null;
  profileHash: string | null;
  appliedAt: string;
  appliedBy: string | null;
}

export class FCStateService {
  private get db() {
    return getDb();
  }

  getState(droneId: string): FCAppliedState | undefined {
    const row = this.db.prepare("SELECT * FROM fc_applied_state WHERE droneId = ?").get(droneId) as any;
    if (!row) return undefined;
    return {
      droneId: row.droneId,
      missionHash: row.missionHash,
      fenceHash: row.fenceHash,
      profileHash: row.profileHash,
      appliedAt: row.appliedAt,
      appliedBy: row.appliedBy,
    };
  }

  recordMissionApplied(droneId: string, missionHash: string, appliedBy?: string): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT droneId FROM fc_applied_state WHERE droneId = ?").get(droneId);
    if (existing) {
      this.db.prepare("UPDATE fc_applied_state SET missionHash = ?, appliedAt = ?, appliedBy = ? WHERE droneId = ?").run(missionHash, now, appliedBy ?? null, droneId);
    } else {
      this.db.prepare("INSERT INTO fc_applied_state (droneId, missionHash, fenceHash, profileHash, appliedAt, appliedBy) VALUES (?, ?, ?, ?, ?, ?)").run(droneId, missionHash, null, null, now, appliedBy ?? null);
    }
  }

  recordFenceApplied(droneId: string, fenceHash: string, appliedBy?: string): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT droneId FROM fc_applied_state WHERE droneId = ?").get(droneId);
    if (existing) {
      this.db.prepare("UPDATE fc_applied_state SET fenceHash = ?, appliedAt = ?, appliedBy = ? WHERE droneId = ?").run(fenceHash, now, appliedBy ?? null, droneId);
    } else {
      this.db.prepare("INSERT INTO fc_applied_state (droneId, missionHash, fenceHash, profileHash, appliedAt, appliedBy) VALUES (?, ?, ?, ?, ?, ?)").run(droneId, null, fenceHash, null, now, appliedBy ?? null);
    }
  }

  recordProfileApplied(droneId: string, profileHash: string, appliedBy?: string): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT droneId FROM fc_applied_state WHERE droneId = ?").get(droneId);
    if (existing) {
      this.db.prepare("UPDATE fc_applied_state SET profileHash = ?, appliedAt = ?, appliedBy = ? WHERE droneId = ?").run(profileHash, now, appliedBy ?? null, droneId);
    } else {
      this.db.prepare("INSERT INTO fc_applied_state (droneId, missionHash, fenceHash, profileHash, appliedAt, appliedBy) VALUES (?, ?, ?, ?, ?, ?)").run(droneId, null, null, profileHash, now, appliedBy ?? null);
    }
  }
}
