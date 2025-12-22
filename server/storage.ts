import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  settings,
  missions,
  waypoints,
  flightLogs,
  sensorData,
  motorTelemetry,
  cameraSettings,
  drones,
  mediaAssets,
  offlineBacklog,
  type Settings,
  type InsertSettings,
  type Mission,
  type InsertMission,
  type Waypoint,
  type InsertWaypoint,
  type FlightLog,
  type InsertFlightLog,
  type SensorData,
  type InsertSensorData,
  type MotorTelemetry,
  type InsertMotorTelemetry,
  type CameraSettings,
  type InsertCameraSettings,
  type Drone,
  type InsertDrone,
  type MediaAsset,
  type InsertMediaAsset,
  type OfflineBacklog,
  type InsertOfflineBacklog,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
  // Settings
  getSetting(key: string): Promise<Settings | undefined>;
  getSettingsByCategory(category: string): Promise<Settings[]>;
  upsertSetting(setting: InsertSettings): Promise<Settings>;
  
  // Missions
  getMission(id: number): Promise<Mission | undefined>;
  getAllMissions(): Promise<Mission[]>;
  createMission(mission: InsertMission): Promise<Mission>;
  updateMission(id: number, mission: Partial<InsertMission>): Promise<Mission | undefined>;
  deleteMission(id: number): Promise<void>;
  
  // Waypoints
  getWaypointsByMission(missionId: number): Promise<Waypoint[]>;
  createWaypoint(waypoint: InsertWaypoint): Promise<Waypoint>;
  updateWaypoint(id: number, waypoint: Partial<InsertWaypoint>): Promise<Waypoint | undefined>;
  deleteWaypoint(id: number): Promise<void>;
  deleteWaypointsByMission(missionId: number): Promise<void>;
  
  // Flight Logs
  createFlightLog(log: InsertFlightLog): Promise<FlightLog>;
  getFlightLogsByMission(missionId: number, limit?: number): Promise<FlightLog[]>;
  getRecentFlightLogs(limit: number): Promise<FlightLog[]>;
  
  // Sensor Data
  createSensorData(data: InsertSensorData): Promise<SensorData>;
  getRecentSensorData(sensorType: string, limit: number): Promise<SensorData[]>;
  
  // Motor Telemetry
  createMotorTelemetry(telemetry: InsertMotorTelemetry): Promise<MotorTelemetry>;
  getRecentMotorTelemetry(limit: number): Promise<MotorTelemetry[]>;
  
  // Camera Settings
  getCameraSettings(): Promise<CameraSettings | undefined>;
  updateCameraSettings(settings: Partial<InsertCameraSettings>): Promise<CameraSettings>;
  
  // Drones
  getDrone(id: number): Promise<Drone | undefined>;
  getDroneByCallsign(callsign: string): Promise<Drone | undefined>;
  getAllDrones(): Promise<Drone[]>;
  createDrone(drone: InsertDrone): Promise<Drone>;
  updateDrone(id: number, drone: Partial<InsertDrone>): Promise<Drone | undefined>;
  updateDroneLocation(id: number, latitude: number, longitude: number, altitude: number, heading: number): Promise<Drone | undefined>;
  deleteDrone(id: number): Promise<void>;
  
  // Media Assets
  getMediaAsset(id: number): Promise<MediaAsset | undefined>;
  getMediaAssetsByDrone(droneId: number, limit?: number): Promise<MediaAsset[]>;
  getMediaAssetsBySession(sessionId: number): Promise<MediaAsset[]>;
  getPendingMediaAssets(): Promise<MediaAsset[]>;
  createMediaAsset(asset: InsertMediaAsset): Promise<MediaAsset>;
  updateMediaAsset(id: number, asset: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined>;
  deleteMediaAsset(id: number): Promise<void>;
  
  // Offline Backlog
  getBacklogItem(id: number): Promise<OfflineBacklog | undefined>;
  getPendingBacklog(droneId?: number): Promise<OfflineBacklog[]>;
  createBacklogItem(item: InsertOfflineBacklog): Promise<OfflineBacklog>;
  updateBacklogItem(id: number, item: Partial<InsertOfflineBacklog>): Promise<OfflineBacklog | undefined>;
  markBacklogSynced(id: number): Promise<void>;
  deleteBacklogItem(id: number): Promise<void>;
  clearSyncedBacklog(droneId?: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Settings
  async getSetting(key: string): Promise<Settings | undefined> {
    const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return result[0];
  }

  async getSettingsByCategory(category: string): Promise<Settings[]> {
    return await db.select().from(settings).where(eq(settings.category, category));
  }

  async upsertSetting(setting: InsertSettings): Promise<Settings> {
    const existing = await this.getSetting(setting.key);
    if (existing) {
      const result = await db
        .update(settings)
        .set({ ...setting, updatedAt: new Date() })
        .where(eq(settings.key, setting.key))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(settings).values(setting).returning();
      return result[0];
    }
  }

  // Missions
  async getMission(id: number): Promise<Mission | undefined> {
    const result = await db.select().from(missions).where(eq(missions.id, id)).limit(1);
    return result[0];
  }

  async getAllMissions(): Promise<Mission[]> {
    return await db.select().from(missions).orderBy(desc(missions.createdAt));
  }

  async createMission(mission: InsertMission): Promise<Mission> {
    const result = await db.insert(missions).values(mission).returning();
    return result[0];
  }

  async updateMission(id: number, mission: Partial<InsertMission>): Promise<Mission | undefined> {
    const result = await db
      .update(missions)
      .set({ ...mission, updatedAt: new Date() })
      .where(eq(missions.id, id))
      .returning();
    return result[0];
  }

  async deleteMission(id: number): Promise<void> {
    await db.delete(missions).where(eq(missions.id, id));
  }

  // Waypoints
  async getWaypointsByMission(missionId: number): Promise<Waypoint[]> {
    return await db.select().from(waypoints).where(eq(waypoints.missionId, missionId)).orderBy(waypoints.order);
  }

  async createWaypoint(waypoint: InsertWaypoint): Promise<Waypoint> {
    const result = await db.insert(waypoints).values(waypoint).returning();
    return result[0];
  }

  async updateWaypoint(id: number, waypoint: Partial<InsertWaypoint>): Promise<Waypoint | undefined> {
    const result = await db.update(waypoints).set(waypoint).where(eq(waypoints.id, id)).returning();
    return result[0];
  }

  async deleteWaypoint(id: number): Promise<void> {
    await db.delete(waypoints).where(eq(waypoints.id, id));
  }

  async deleteWaypointsByMission(missionId: number): Promise<void> {
    await db.delete(waypoints).where(eq(waypoints.missionId, missionId));
  }

  // Flight Logs
  async createFlightLog(log: InsertFlightLog): Promise<FlightLog> {
    const result = await db.insert(flightLogs).values(log).returning();
    return result[0];
  }

  async getFlightLogsByMission(missionId: number, limit: number = 100): Promise<FlightLog[]> {
    return await db
      .select()
      .from(flightLogs)
      .where(eq(flightLogs.missionId, missionId))
      .orderBy(desc(flightLogs.timestamp))
      .limit(limit);
  }

  async getRecentFlightLogs(limit: number): Promise<FlightLog[]> {
    return await db.select().from(flightLogs).orderBy(desc(flightLogs.timestamp)).limit(limit);
  }

  // Sensor Data
  async createSensorData(data: InsertSensorData): Promise<SensorData> {
    const result = await db.insert(sensorData).values(data).returning();
    return result[0];
  }

  async getRecentSensorData(sensorType: string, limit: number): Promise<SensorData[]> {
    return await db
      .select()
      .from(sensorData)
      .where(eq(sensorData.sensorType, sensorType))
      .orderBy(desc(sensorData.timestamp))
      .limit(limit);
  }

  // Motor Telemetry
  async createMotorTelemetry(telemetry: InsertMotorTelemetry): Promise<MotorTelemetry> {
    const result = await db.insert(motorTelemetry).values(telemetry).returning();
    return result[0];
  }

  async getRecentMotorTelemetry(limit: number): Promise<MotorTelemetry[]> {
    return await db.select().from(motorTelemetry).orderBy(desc(motorTelemetry.timestamp)).limit(limit);
  }

  // Camera Settings
  async getCameraSettings(): Promise<CameraSettings | undefined> {
    const result = await db.select().from(cameraSettings).limit(1);
    if (result.length === 0) {
      // Create default settings if none exist
      const defaults = await db.insert(cameraSettings).values({}).returning();
      return defaults[0];
    }
    return result[0];
  }

  async updateCameraSettings(settings: Partial<InsertCameraSettings>): Promise<CameraSettings> {
    const existing = await this.getCameraSettings();
    if (existing) {
      const result = await db
        .update(cameraSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(cameraSettings.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(cameraSettings).values(settings).returning();
    return result[0];
  }

  // Drones
  async getDrone(id: number): Promise<Drone | undefined> {
    const result = await db.select().from(drones).where(eq(drones.id, id)).limit(1);
    return result[0];
  }

  async getDroneByCallsign(callsign: string): Promise<Drone | undefined> {
    const result = await db.select().from(drones).where(eq(drones.callsign, callsign)).limit(1);
    return result[0];
  }

  async getAllDrones(): Promise<Drone[]> {
    return await db.select().from(drones).orderBy(desc(drones.updatedAt));
  }

  async createDrone(drone: InsertDrone): Promise<Drone> {
    const result = await db.insert(drones).values(drone).returning();
    return result[0];
  }

  async updateDrone(id: number, drone: Partial<InsertDrone>): Promise<Drone | undefined> {
    const result = await db
      .update(drones)
      .set({ ...drone, updatedAt: new Date() })
      .where(eq(drones.id, id))
      .returning();
    return result[0];
  }

  async updateDroneLocation(id: number, latitude: number, longitude: number, altitude: number, heading: number): Promise<Drone | undefined> {
    const result = await db
      .update(drones)
      .set({ latitude, longitude, altitude, heading, lastSeen: new Date(), updatedAt: new Date() })
      .where(eq(drones.id, id))
      .returning();
    return result[0];
  }

  async deleteDrone(id: number): Promise<void> {
    await db.delete(drones).where(eq(drones.id, id));
  }

  // Media Assets
  async getMediaAsset(id: number): Promise<MediaAsset | undefined> {
    const result = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    return result[0];
  }

  async getMediaAssetsByDrone(droneId: number, limit: number = 100): Promise<MediaAsset[]> {
    return await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.droneId, droneId))
      .orderBy(desc(mediaAssets.capturedAt))
      .limit(limit);
  }

  async getMediaAssetsBySession(sessionId: number): Promise<MediaAsset[]> {
    return await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.sessionId, sessionId))
      .orderBy(desc(mediaAssets.capturedAt));
  }

  async getPendingMediaAssets(): Promise<MediaAsset[]> {
    return await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.syncStatus, "pending"))
      .orderBy(mediaAssets.capturedAt);
  }

  async createMediaAsset(asset: InsertMediaAsset): Promise<MediaAsset> {
    const result = await db.insert(mediaAssets).values(asset).returning();
    return result[0];
  }

  async updateMediaAsset(id: number, asset: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined> {
    const result = await db.update(mediaAssets).set(asset).where(eq(mediaAssets.id, id)).returning();
    return result[0];
  }

  async deleteMediaAsset(id: number): Promise<void> {
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  }

  // Offline Backlog
  async getBacklogItem(id: number): Promise<OfflineBacklog | undefined> {
    const result = await db.select().from(offlineBacklog).where(eq(offlineBacklog.id, id)).limit(1);
    return result[0];
  }

  async getPendingBacklog(droneId?: number): Promise<OfflineBacklog[]> {
    let query = db
      .select()
      .from(offlineBacklog)
      .where(eq(offlineBacklog.syncStatus, "pending"))
      .orderBy(desc(offlineBacklog.priority), offlineBacklog.recordedAt);
    
    if (droneId !== undefined) {
      return await db
        .select()
        .from(offlineBacklog)
        .where(eq(offlineBacklog.droneId, droneId))
        .orderBy(desc(offlineBacklog.priority), offlineBacklog.recordedAt);
    }
    
    return await query;
  }

  async createBacklogItem(item: InsertOfflineBacklog): Promise<OfflineBacklog> {
    const result = await db.insert(offlineBacklog).values(item).returning();
    return result[0];
  }

  async updateBacklogItem(id: number, item: Partial<InsertOfflineBacklog>): Promise<OfflineBacklog | undefined> {
    const result = await db
      .update(offlineBacklog)
      .set({ ...item, lastSyncAttempt: new Date() })
      .where(eq(offlineBacklog.id, id))
      .returning();
    return result[0];
  }

  async markBacklogSynced(id: number): Promise<void> {
    await db
      .update(offlineBacklog)
      .set({ syncStatus: "synced", syncedAt: new Date() })
      .where(eq(offlineBacklog.id, id));
  }

  async deleteBacklogItem(id: number): Promise<void> {
    await db.delete(offlineBacklog).where(eq(offlineBacklog.id, id));
  }

  async clearSyncedBacklog(droneId?: number): Promise<void> {
    if (droneId !== undefined) {
      await db
        .delete(offlineBacklog)
        .where(eq(offlineBacklog.droneId, droneId));
    } else {
      await db
        .delete(offlineBacklog)
        .where(eq(offlineBacklog.syncStatus, "synced"));
    }
  }
}

export const storage = new DatabaseStorage();
