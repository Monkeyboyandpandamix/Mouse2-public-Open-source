import { getDb } from "../db/client.js";
import * as fs from "fs";
import * as path from "path";

const SESSION_ID = "default";
const MAP_DIR = path.resolve(process.cwd(), "data", "3d-maps");

export interface Mapping3DSession {
  id: string;
  active: boolean;
  framesCaptured: number;
  coveragePercent: number;
  confidence: number;
  trackX: number;
  trackY: number;
  distanceEstimate: number;
  coverageBins: string[];
  trajectory: Array<{ x: number; y: number; t: number; conf: number }>;
  lastFrameAt: string | null;
  updatedAt: string;
}

export interface Mapping3DModel {
  id: string;
  jsonPath: string;
  plyPath: string | null;
  framesCaptured: number;
  coveragePercent: number;
  confidence: number;
  estimatedDistance: number;
  generatedAt: string;
  createdAt: string;
}

function ensureMapDir(): void {
  fs.mkdirSync(MAP_DIR, { recursive: true });
}

export class Mapping3DService {
  private get db() {
    return getDb();
  }

  getSession(): Mapping3DSession | null {
    const row = this.db.prepare("SELECT * FROM mapping_3d_sessions WHERE id = ?").get(SESSION_ID) as any;
    if (!row) return null;
    let trajectory: Array<{ x: number; y: number; t: number; conf: number }> = [];
    let coverageBins: string[] = [];
    try {
      trajectory = row.trajectory ? JSON.parse(row.trajectory) : [];
    } catch {
      trajectory = [];
    }
    try {
      coverageBins = row.coverageBins ? JSON.parse(row.coverageBins) : [];
    } catch {
      coverageBins = [];
    }
    return {
      id: row.id,
      active: Boolean(row.active),
      framesCaptured: row.framesCaptured ?? 0,
      coveragePercent: row.coveragePercent ?? 0,
      confidence: row.confidence ?? 0,
      trackX: row.trackX ?? 0,
      trackY: row.trackY ?? 0,
      distanceEstimate: row.distanceEstimate ?? 0,
      coverageBins,
      trajectory,
      lastFrameAt: row.lastFrameAt,
      updatedAt: row.updatedAt,
    };
  }

  upsertSession(updates: Partial<Mapping3DSession>): Mapping3DSession {
    const now = new Date().toISOString();
    const existing = this.getSession();
    const merged: Mapping3DSession = existing
      ? { ...existing, ...updates, updatedAt: now }
      : {
          id: SESSION_ID,
          active: true,
          framesCaptured: 0,
          coveragePercent: 0,
          confidence: 0,
          trackX: 0,
          trackY: 0,
          distanceEstimate: 0,
          coverageBins: [],
          trajectory: [],
          lastFrameAt: null,
          updatedAt: now,
          ...updates,
        };

    const trajectoryJson = JSON.stringify(merged.trajectory);
    const coverageBinsJson = JSON.stringify(merged.coverageBins);

    this.db
      .prepare(
        `INSERT INTO mapping_3d_sessions (id, active, framesCaptured, coveragePercent, confidence, trackX, trackY, distanceEstimate, coverageBins, trajectory, lastFrameAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           active = excluded.active,
           framesCaptured = excluded.framesCaptured,
           coveragePercent = excluded.coveragePercent,
           confidence = excluded.confidence,
           trackX = excluded.trackX,
           trackY = excluded.trackY,
           distanceEstimate = excluded.distanceEstimate,
           coverageBins = excluded.coverageBins,
           trajectory = excluded.trajectory,
           lastFrameAt = excluded.lastFrameAt,
           updatedAt = excluded.updatedAt`
      )
      .run(
        merged.id,
        merged.active ? 1 : 0,
        merged.framesCaptured,
        merged.coveragePercent,
        merged.confidence,
        merged.trackX,
        merged.trackY,
        merged.distanceEstimate,
        coverageBinsJson,
        trajectoryJson,
        merged.lastFrameAt,
        merged.updatedAt
      );
    return merged;
  }

  resetSession(): Mapping3DSession {
    return this.upsertSession({
      active: true,
      framesCaptured: 0,
      coveragePercent: 0,
      confidence: 0,
      trackX: 0,
      trackY: 0,
      distanceEstimate: 0,
      coverageBins: [],
      trajectory: [],
      lastFrameAt: null,
    });
  }

  createModel(session: Mapping3DSession): { model: Mapping3DModel; jsonContent: string; plyContent: string } {
    ensureMapDir();
    const ts = new Date();
    const stamp = ts.toISOString().replace(/[:.]/g, "-");
    const modelId = `map3d-${stamp}`;

    const pointCloud = session.trajectory.map((point, index) => ({
      x: point.x,
      y: point.y,
      z: Math.round(Math.sin(index / 14) * 5 * 100) / 100,
      confidence: Math.round(point.conf * 100),
    }));

    const modelData = {
      type: "local-photogrammetry-map",
      generatedAt: ts.toISOString(),
      frameCount: session.framesCaptured,
      coveragePercent: session.coveragePercent,
      confidence: session.confidence,
      estimatedDistance: Math.round(session.distanceEstimate * 100) / 100,
      trajectory: session.trajectory,
      pointCloud,
      metadata: {
        standalone: true,
        externalServices: false,
        generator: "M.O.U.S.E. production mapping pipeline",
      },
    };

    const jsonContent = JSON.stringify(modelData, null, 2);
    const jsonPath = path.join(MAP_DIR, `${modelId}.json`);
    fs.writeFileSync(jsonPath, jsonContent, "utf-8");

    // PLY format (standard 3D point cloud)
    const plyLines: string[] = [
      "ply",
      "format ascii 1.0",
      `element vertex ${pointCloud.length}`,
      "property float x",
      "property float y",
      "property float z",
      "property float confidence",
      "end_header",
      ...pointCloud.map((p) => `${p.x} ${p.y} ${p.z} ${p.confidence / 100}`),
    ];
    const plyContent = plyLines.join("\n");
    const plyPath = path.join(MAP_DIR, `${modelId}.ply`);
    fs.writeFileSync(plyPath, plyContent, "utf-8");

    const model: Mapping3DModel = {
      id: modelId,
      jsonPath,
      plyPath,
      framesCaptured: session.framesCaptured,
      coveragePercent: session.coveragePercent,
      confidence: session.confidence,
      estimatedDistance: Math.round(session.distanceEstimate * 100) / 100,
      generatedAt: ts.toISOString(),
      createdAt: ts.toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO mapping_3d_models (id, jsonPath, plyPath, framesCaptured, coveragePercent, confidence, estimatedDistance, generatedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        model.id,
        model.jsonPath,
        model.plyPath,
        model.framesCaptured,
        model.coveragePercent,
        model.confidence,
        model.estimatedDistance,
        model.generatedAt,
        model.createdAt
      );

    return { model, jsonContent, plyContent };
  }

  getLatestModel(): Mapping3DModel | null {
    const row = this.db
      .prepare("SELECT * FROM mapping_3d_models ORDER BY createdAt DESC LIMIT 1")
      .get() as any;
    if (!row) return null;
    return {
      id: row.id,
      jsonPath: row.jsonPath,
      plyPath: row.plyPath,
      framesCaptured: row.framesCaptured,
      coveragePercent: row.coveragePercent,
      confidence: row.confidence,
      estimatedDistance: row.estimatedDistance,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
    };
  }

  listModels(limit = 50): Mapping3DModel[] {
    const rows = this.db
      .prepare("SELECT * FROM mapping_3d_models ORDER BY createdAt DESC LIMIT ?")
      .all(limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      jsonPath: r.jsonPath,
      plyPath: r.plyPath,
      framesCaptured: r.framesCaptured,
      coveragePercent: r.coveragePercent,
      confidence: r.confidence,
      estimatedDistance: r.estimatedDistance,
      generatedAt: r.generatedAt,
      createdAt: r.createdAt,
    }));
  }

  getModelJson(id: string): string | null {
    const row = this.db.prepare("SELECT jsonPath FROM mapping_3d_models WHERE id = ?").get(id) as any;
    if (!row?.jsonPath) return null;
    try {
      return fs.readFileSync(row.jsonPath, "utf-8");
    } catch {
      return null;
    }
  }

  getModelPly(id: string): string | null {
    const row = this.db.prepare("SELECT plyPath FROM mapping_3d_models WHERE id = ?").get(id) as any;
    if (!row?.plyPath) return null;
    try {
      return fs.readFileSync(row.plyPath, "utf-8");
    } catch {
      return null;
    }
  }
}
