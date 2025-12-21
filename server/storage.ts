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
}

export const storage = new DatabaseStorage();
