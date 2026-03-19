import type {
  Settings,
  InsertSettings,
  Mission,
  InsertMission,
  Waypoint,
  InsertWaypoint,
  FlightLog,
  InsertFlightLog,
  SensorData,
  InsertSensorData,
  MotorTelemetry,
  InsertMotorTelemetry,
  CameraSettings,
  InsertCameraSettings,
  Drone,
  InsertDrone,
  MediaAsset,
  InsertMediaAsset,
  OfflineBacklog,
  InsertOfflineBacklog,
  UserMessage,
  InsertUserMessage,
} from "@shared/schema";

export interface IStorage {
  getSetting(key: string): Promise<Settings | undefined>;
  getSettingsByCategory(category: string): Promise<Settings[]>;
  upsertSetting(setting: InsertSettings): Promise<Settings>;

  getMission(id: string): Promise<Mission | undefined>;
  getAllMissions(): Promise<Mission[]>;
  createMission(mission: InsertMission): Promise<Mission>;
  updateMission(id: string, mission: Partial<InsertMission>): Promise<Mission | undefined>;
  deleteMission(id: string): Promise<void>;

  getWaypointsByMission(missionId: string): Promise<Waypoint[]>;
  createWaypoint(waypoint: InsertWaypoint): Promise<Waypoint>;
  updateWaypoint(id: string, waypoint: Partial<InsertWaypoint>): Promise<Waypoint | undefined>;
  deleteWaypoint(id: string): Promise<void>;
  deleteWaypointsByMission(missionId: string): Promise<void>;

  createFlightLog(log: InsertFlightLog): Promise<FlightLog>;
  getFlightLogsByMission(missionId: string, limit?: number): Promise<FlightLog[]>;
  getRecentFlightLogs(limit: number): Promise<FlightLog[]>;
  deleteFlightLog(id: string): Promise<void>;

  createSensorData(data: InsertSensorData): Promise<SensorData>;
  getRecentSensorData(sensorType: string, limit: number): Promise<SensorData[]>;

  createMotorTelemetry(telemetry: InsertMotorTelemetry): Promise<MotorTelemetry>;
  getRecentMotorTelemetry(limit: number): Promise<MotorTelemetry[]>;

  getCameraSettings(droneId?: string): Promise<CameraSettings | undefined>;
  updateCameraSettings(settings: Partial<InsertCameraSettings>, droneId?: string): Promise<CameraSettings>;

  getDrone(id: string): Promise<Drone | undefined>;
  getDroneByCallsign(callsign: string): Promise<Drone | undefined>;
  getAllDrones(): Promise<Drone[]>;
  createDrone(drone: InsertDrone): Promise<Drone>;
  updateDrone(id: string, drone: Partial<InsertDrone>): Promise<Drone | undefined>;
  updateDroneLocation(id: string, latitude: number, longitude: number, altitude: number, heading: number): Promise<Drone | undefined>;
  deleteDrone(id: string): Promise<void>;

  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  getMediaAssetsByDrone(droneId: string, limit?: number): Promise<MediaAsset[]>;
  getMediaAssetsBySession(sessionId: string): Promise<MediaAsset[]>;
  getPendingMediaAssets(): Promise<MediaAsset[]>;
  createMediaAsset(asset: InsertMediaAsset): Promise<MediaAsset>;
  updateMediaAsset(id: string, asset: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined>;
  deleteMediaAsset(id: string): Promise<void>;

  getBacklogItem(id: string): Promise<OfflineBacklog | undefined>;
  getPendingBacklog(droneId?: string): Promise<OfflineBacklog[]>;
  createBacklogItem(item: InsertOfflineBacklog): Promise<OfflineBacklog>;
  updateBacklogItem(id: string, item: Partial<InsertOfflineBacklog>): Promise<OfflineBacklog | undefined>;
  markBacklogSynced(id: string): Promise<void>;
  deleteBacklogItem(id: string): Promise<void>;
  clearSyncedBacklog(droneId?: string): Promise<void>;

  getAllMessages(): Promise<UserMessage[]>;
  getAllMessagesWithHistory(): Promise<UserMessage[]>;
  getMessagesForUser(userId: string): Promise<UserMessage[]>;
  getMessageById(id: string): Promise<UserMessage | undefined>;
  getChatUsers(): Promise<{ id: string; username: string; role: string }[]>;
  createMessage(message: InsertUserMessage): Promise<UserMessage>;
  updateMessage(id: string, content: string): Promise<UserMessage | undefined>;
  deleteMessage(id: string, deletedBy?: string): Promise<void>;
  syncMessagesToSheets(messages: UserMessage[]): Promise<void>;

  syncToGoogle(): Promise<void>;
}
