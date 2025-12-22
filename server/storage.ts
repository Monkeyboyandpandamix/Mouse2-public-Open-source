import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import {
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
  type UserMessage,
  type InsertUserMessage,
} from "@shared/schema";

// Data directory for local JSON storage
const DATA_DIR = process.env.DATA_DIR || './data';

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Read JSON file safely
function readJsonFile<T>(filename: string, defaultValue: T[] = []): T[] {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
  }
  return defaultValue;
}

// Write JSON file safely
function writeJsonFile<T>(filename: string, data: T[]): void {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
  }
}

// Google Sheets Integration (connection:conn_google-sheet_01KCZ7P27Z37NA3NNY4MFZPABN)
let sheetConnectionSettings: any;

async function getSheetAccessToken() {
  if (sheetConnectionSettings && sheetConnectionSettings.settings.expires_at && new Date(sheetConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return sheetConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    console.log('Google Sheets integration not available (offline mode)');
    return null;
  }

  try {
    sheetConnectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = sheetConnectionSettings?.settings?.access_token || sheetConnectionSettings.settings?.oauth?.credentials?.access_token;
    return accessToken || null;
  } catch (error) {
    console.log('Failed to get Google Sheets token:', error);
    return null;
  }
}

async function getGoogleSheetsClient() {
  const accessToken = await getSheetAccessToken();
  if (!accessToken) return null;

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

// Google Drive Integration (connection:conn_google-drive_01KCZ7KBPA4BD72Z487ZYNMB0S)
let driveConnectionSettings: any;

async function getDriveAccessToken() {
  if (driveConnectionSettings && driveConnectionSettings.settings.expires_at && new Date(driveConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    return driveConnectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    console.log('Google Drive integration not available (offline mode)');
    return null;
  }

  try {
    driveConnectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = driveConnectionSettings?.settings?.access_token || driveConnectionSettings.settings?.oauth?.credentials?.access_token;
    return accessToken || null;
  } catch (error) {
    console.log('Failed to get Google Drive token:', error);
    return null;
  }
}

async function getGoogleDriveClient() {
  const accessToken = await getDriveAccessToken();
  if (!accessToken) return null;

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export interface IStorage {
  // Settings
  getSetting(key: string): Promise<Settings | undefined>;
  getSettingsByCategory(category: string): Promise<Settings[]>;
  upsertSetting(setting: InsertSettings): Promise<Settings>;
  
  // Missions
  getMission(id: string): Promise<Mission | undefined>;
  getAllMissions(): Promise<Mission[]>;
  createMission(mission: InsertMission): Promise<Mission>;
  updateMission(id: string, mission: Partial<InsertMission>): Promise<Mission | undefined>;
  deleteMission(id: string): Promise<void>;
  
  // Waypoints
  getWaypointsByMission(missionId: string): Promise<Waypoint[]>;
  createWaypoint(waypoint: InsertWaypoint): Promise<Waypoint>;
  updateWaypoint(id: string, waypoint: Partial<InsertWaypoint>): Promise<Waypoint | undefined>;
  deleteWaypoint(id: string): Promise<void>;
  deleteWaypointsByMission(missionId: string): Promise<void>;
  
  // Flight Logs
  createFlightLog(log: InsertFlightLog): Promise<FlightLog>;
  getFlightLogsByMission(missionId: string, limit?: number): Promise<FlightLog[]>;
  getRecentFlightLogs(limit: number): Promise<FlightLog[]>;
  deleteFlightLog(id: string): Promise<void>;
  
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
  getDrone(id: string): Promise<Drone | undefined>;
  getDroneByCallsign(callsign: string): Promise<Drone | undefined>;
  getAllDrones(): Promise<Drone[]>;
  createDrone(drone: InsertDrone): Promise<Drone>;
  updateDrone(id: string, drone: Partial<InsertDrone>): Promise<Drone | undefined>;
  updateDroneLocation(id: string, latitude: number, longitude: number, altitude: number, heading: number): Promise<Drone | undefined>;
  deleteDrone(id: string): Promise<void>;
  
  // Media Assets
  getMediaAsset(id: string): Promise<MediaAsset | undefined>;
  getMediaAssetsByDrone(droneId: string, limit?: number): Promise<MediaAsset[]>;
  getMediaAssetsBySession(sessionId: string): Promise<MediaAsset[]>;
  getPendingMediaAssets(): Promise<MediaAsset[]>;
  createMediaAsset(asset: InsertMediaAsset): Promise<MediaAsset>;
  updateMediaAsset(id: string, asset: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined>;
  deleteMediaAsset(id: string): Promise<void>;
  
  // Offline Backlog
  getBacklogItem(id: string): Promise<OfflineBacklog | undefined>;
  getPendingBacklog(droneId?: string): Promise<OfflineBacklog[]>;
  createBacklogItem(item: InsertOfflineBacklog): Promise<OfflineBacklog>;
  updateBacklogItem(id: string, item: Partial<InsertOfflineBacklog>): Promise<OfflineBacklog | undefined>;
  markBacklogSynced(id: string): Promise<void>;
  deleteBacklogItem(id: string): Promise<void>;
  clearSyncedBacklog(droneId?: string): Promise<void>;
  
  // User Messages (Team Communication)
  getAllMessages(): Promise<UserMessage[]>;
  createMessage(message: InsertUserMessage): Promise<UserMessage>;
  updateMessage(id: string, content: string): Promise<UserMessage | undefined>;
  deleteMessage(id: string): Promise<void>;
  syncMessagesToSheets(messages: UserMessage[]): Promise<void>;
  
  // Sync operations
  syncToGoogle(): Promise<void>;
}

export class FileStorage implements IStorage {
  private syncPending = false;

  // Settings
  async getSetting(key: string): Promise<Settings | undefined> {
    const settings = readJsonFile<Settings>('settings.json');
    return settings.find(s => s.key === key);
  }

  async getSettingsByCategory(category: string): Promise<Settings[]> {
    const settings = readJsonFile<Settings>('settings.json');
    return settings.filter(s => s.category === category);
  }

  async upsertSetting(setting: InsertSettings): Promise<Settings> {
    const settings = readJsonFile<Settings>('settings.json');
    const existingIndex = settings.findIndex(s => s.key === setting.key);
    
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      settings[existingIndex] = { ...settings[existingIndex], ...setting, updatedAt: now };
      writeJsonFile('settings.json', settings);
      this.markSyncPending();
      return settings[existingIndex];
    } else {
      const newSetting: Settings = { id: generateId(), ...setting, updatedAt: now };
      settings.push(newSetting);
      writeJsonFile('settings.json', settings);
      this.markSyncPending();
      return newSetting;
    }
  }

  // Missions
  async getMission(id: string): Promise<Mission | undefined> {
    const missions = readJsonFile<Mission>('missions.json');
    return missions.find(m => m.id === id);
  }

  async getAllMissions(): Promise<Mission[]> {
    const missions = readJsonFile<Mission>('missions.json');
    return missions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createMission(mission: InsertMission): Promise<Mission> {
    const missions = readJsonFile<Mission>('missions.json');
    const now = new Date().toISOString();
    const newMission: Mission = {
      id: generateId(),
      ...mission,
      status: mission.status || 'planned',
      homeAltitude: mission.homeAltitude || 0,
      createdAt: now,
      updatedAt: now,
    };
    missions.push(newMission);
    writeJsonFile('missions.json', missions);
    this.markSyncPending();
    return newMission;
  }

  async updateMission(id: string, mission: Partial<InsertMission>): Promise<Mission | undefined> {
    const missions = readJsonFile<Mission>('missions.json');
    const index = missions.findIndex(m => m.id === id);
    if (index < 0) return undefined;
    
    missions[index] = { ...missions[index], ...mission, updatedAt: new Date().toISOString() };
    writeJsonFile('missions.json', missions);
    this.markSyncPending();
    return missions[index];
  }

  async deleteMission(id: string): Promise<void> {
    let missions = readJsonFile<Mission>('missions.json');
    missions = missions.filter(m => m.id !== id);
    writeJsonFile('missions.json', missions);
    
    // Also delete waypoints for this mission
    await this.deleteWaypointsByMission(id);
    this.markSyncPending();
  }

  // Waypoints
  async getWaypointsByMission(missionId: string): Promise<Waypoint[]> {
    const waypoints = readJsonFile<Waypoint>('waypoints.json');
    return waypoints.filter(w => w.missionId === missionId).sort((a, b) => a.order - b.order);
  }

  async createWaypoint(waypoint: InsertWaypoint): Promise<Waypoint> {
    const waypoints = readJsonFile<Waypoint>('waypoints.json');
    const newWaypoint: Waypoint = { id: generateId(), ...waypoint };
    waypoints.push(newWaypoint);
    writeJsonFile('waypoints.json', waypoints);
    this.markSyncPending();
    return newWaypoint;
  }

  async updateWaypoint(id: string, waypoint: Partial<InsertWaypoint>): Promise<Waypoint | undefined> {
    const waypoints = readJsonFile<Waypoint>('waypoints.json');
    const index = waypoints.findIndex(w => w.id === id);
    if (index < 0) return undefined;
    
    waypoints[index] = { ...waypoints[index], ...waypoint };
    writeJsonFile('waypoints.json', waypoints);
    this.markSyncPending();
    return waypoints[index];
  }

  async deleteWaypoint(id: string): Promise<void> {
    let waypoints = readJsonFile<Waypoint>('waypoints.json');
    waypoints = waypoints.filter(w => w.id !== id);
    writeJsonFile('waypoints.json', waypoints);
    this.markSyncPending();
  }

  async deleteWaypointsByMission(missionId: string): Promise<void> {
    let waypoints = readJsonFile<Waypoint>('waypoints.json');
    waypoints = waypoints.filter(w => w.missionId !== missionId);
    writeJsonFile('waypoints.json', waypoints);
    this.markSyncPending();
  }

  // Flight Logs
  async createFlightLog(log: InsertFlightLog): Promise<FlightLog> {
    const logs = readJsonFile<FlightLog>('flight_logs.json');
    const newLog: FlightLog = {
      id: generateId(),
      ...log,
      armed: log.armed ?? false,
      timestamp: new Date().toISOString(),
    };
    logs.push(newLog);
    
    // Keep only last 10000 logs to prevent file from getting too large
    const trimmedLogs = logs.slice(-10000);
    writeJsonFile('flight_logs.json', trimmedLogs);
    this.markSyncPending();
    return newLog;
  }

  async getFlightLogsByMission(missionId: string, limit: number = 100): Promise<FlightLog[]> {
    const logs = readJsonFile<FlightLog>('flight_logs.json');
    return logs
      .filter(l => l.missionId === missionId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getRecentFlightLogs(limit: number): Promise<FlightLog[]> {
    const logs = readJsonFile<FlightLog>('flight_logs.json');
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async deleteFlightLog(id: string): Promise<void> {
    let logs = readJsonFile<FlightLog>('flight_logs.json');
    logs = logs.filter(l => l.id !== id);
    writeJsonFile('flight_logs.json', logs);
    this.markSyncPending();
  }

  // Sensor Data
  async createSensorData(data: InsertSensorData): Promise<SensorData> {
    const sensorData = readJsonFile<SensorData>('sensor_data.json');
    const newData: SensorData = {
      id: generateId(),
      ...data,
      timestamp: new Date().toISOString(),
    };
    sensorData.push(newData);
    
    // Keep only last 5000 entries
    const trimmed = sensorData.slice(-5000);
    writeJsonFile('sensor_data.json', trimmed);
    return newData;
  }

  async getRecentSensorData(sensorType: string, limit: number): Promise<SensorData[]> {
    const sensorData = readJsonFile<SensorData>('sensor_data.json');
    return sensorData
      .filter(s => s.sensorType === sensorType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // Motor Telemetry
  async createMotorTelemetry(telemetry: InsertMotorTelemetry): Promise<MotorTelemetry> {
    const motorData = readJsonFile<MotorTelemetry>('motor_telemetry.json');
    const newData: MotorTelemetry = {
      id: generateId(),
      ...telemetry,
      timestamp: new Date().toISOString(),
    };
    motorData.push(newData);
    
    // Keep only last 5000 entries
    const trimmed = motorData.slice(-5000);
    writeJsonFile('motor_telemetry.json', trimmed);
    return newData;
  }

  async getRecentMotorTelemetry(limit: number): Promise<MotorTelemetry[]> {
    const motorData = readJsonFile<MotorTelemetry>('motor_telemetry.json');
    return motorData
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // Camera Settings
  async getCameraSettings(): Promise<CameraSettings | undefined> {
    const settings = readJsonFile<CameraSettings>('camera_settings.json');
    if (settings.length === 0) {
      const defaults: CameraSettings = {
        id: generateId(),
        activeCamera: 'gimbal',
        trackingEnabled: false,
        recordingEnabled: false,
        updatedAt: new Date().toISOString(),
      };
      writeJsonFile('camera_settings.json', [defaults]);
      return defaults;
    }
    return settings[0];
  }

  async updateCameraSettings(settings: Partial<InsertCameraSettings>): Promise<CameraSettings> {
    const existing = await this.getCameraSettings();
    const updated: CameraSettings = {
      ...existing!,
      ...settings,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile('camera_settings.json', [updated]);
    this.markSyncPending();
    return updated;
  }

  // Drones
  async getDrone(id: string): Promise<Drone | undefined> {
    const drones = readJsonFile<Drone>('drones.json');
    return drones.find(d => d.id === id);
  }

  async getDroneByCallsign(callsign: string): Promise<Drone | undefined> {
    const drones = readJsonFile<Drone>('drones.json');
    return drones.find(d => d.callsign === callsign);
  }

  async getAllDrones(): Promise<Drone[]> {
    const drones = readJsonFile<Drone>('drones.json');
    return drones.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createDrone(drone: InsertDrone): Promise<Drone> {
    const drones = readJsonFile<Drone>('drones.json');
    const now = new Date().toISOString();
    const newDrone: Drone = {
      id: generateId(),
      ...drone,
      model: drone.model || 'Custom',
      status: drone.status || 'offline',
      connectionType: drone.connectionType || 'mavlink',
      gpsStatus: drone.gpsStatus || 'no_fix',
      geofenceEnabled: drone.geofenceEnabled ?? false,
      motorCount: drone.motorCount ?? 4,
      hasGripper: drone.hasGripper ?? false,
      hasCamera: drone.hasCamera ?? true,
      hasThermal: drone.hasThermal ?? false,
      hasLidar: drone.hasLidar ?? false,
      maxSpeed: drone.maxSpeed ?? 15,
      maxAltitude: drone.maxAltitude ?? 120,
      rtlAltitude: drone.rtlAltitude ?? 50,
      createdAt: now,
      updatedAt: now,
    };
    drones.push(newDrone);
    writeJsonFile('drones.json', drones);
    this.markSyncPending();
    return newDrone;
  }

  async updateDrone(id: string, drone: Partial<InsertDrone>): Promise<Drone | undefined> {
    const drones = readJsonFile<Drone>('drones.json');
    const index = drones.findIndex(d => d.id === id);
    if (index < 0) return undefined;
    
    drones[index] = { ...drones[index], ...drone, updatedAt: new Date().toISOString() };
    writeJsonFile('drones.json', drones);
    this.markSyncPending();
    return drones[index];
  }

  async updateDroneLocation(id: string, latitude: number, longitude: number, altitude: number, heading: number): Promise<Drone | undefined> {
    const drones = readJsonFile<Drone>('drones.json');
    const index = drones.findIndex(d => d.id === id);
    if (index < 0) return undefined;
    
    const now = new Date().toISOString();
    drones[index] = { ...drones[index], latitude, longitude, altitude, heading, lastSeen: now, updatedAt: now };
    writeJsonFile('drones.json', drones);
    return drones[index];
  }

  async deleteDrone(id: string): Promise<void> {
    let drones = readJsonFile<Drone>('drones.json');
    drones = drones.filter(d => d.id !== id);
    writeJsonFile('drones.json', drones);
    this.markSyncPending();
  }

  // Media Assets
  async getMediaAsset(id: string): Promise<MediaAsset | undefined> {
    const assets = readJsonFile<MediaAsset>('media_assets.json');
    return assets.find(a => a.id === id);
  }

  async getMediaAssetsByDrone(droneId: string, limit: number = 100): Promise<MediaAsset[]> {
    const assets = readJsonFile<MediaAsset>('media_assets.json');
    return assets
      .filter(a => a.droneId === droneId)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
      .slice(0, limit);
  }

  async getMediaAssetsBySession(sessionId: string): Promise<MediaAsset[]> {
    const assets = readJsonFile<MediaAsset>('media_assets.json');
    return assets
      .filter(a => a.sessionId === sessionId)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  }

  async getPendingMediaAssets(): Promise<MediaAsset[]> {
    const assets = readJsonFile<MediaAsset>('media_assets.json');
    return assets.filter(a => a.syncStatus === 'pending');
  }

  async createMediaAsset(asset: InsertMediaAsset): Promise<MediaAsset> {
    const assets = readJsonFile<MediaAsset>('media_assets.json');
    const newAsset: MediaAsset = {
      id: generateId(),
      ...asset,
      syncStatus: asset.syncStatus || 'synced',
      createdAt: new Date().toISOString(),
    };
    assets.push(newAsset);
    writeJsonFile('media_assets.json', assets);
    this.markSyncPending();
    return newAsset;
  }

  async updateMediaAsset(id: string, asset: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined> {
    const assets = readJsonFile<MediaAsset>('media_assets.json');
    const index = assets.findIndex(a => a.id === id);
    if (index < 0) return undefined;
    
    assets[index] = { ...assets[index], ...asset };
    writeJsonFile('media_assets.json', assets);
    this.markSyncPending();
    return assets[index];
  }

  async deleteMediaAsset(id: string): Promise<void> {
    let assets = readJsonFile<MediaAsset>('media_assets.json');
    assets = assets.filter(a => a.id !== id);
    writeJsonFile('media_assets.json', assets);
    this.markSyncPending();
  }

  // Offline Backlog
  async getBacklogItem(id: string): Promise<OfflineBacklog | undefined> {
    const backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    return backlog.find(b => b.id === id);
  }

  async getPendingBacklog(droneId?: string): Promise<OfflineBacklog[]> {
    const backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    let filtered = backlog.filter(b => b.syncStatus === 'pending');
    if (droneId) {
      filtered = filtered.filter(b => b.droneId === droneId);
    }
    return filtered.sort((a, b) => b.priority - a.priority);
  }

  async createBacklogItem(item: InsertOfflineBacklog): Promise<OfflineBacklog> {
    const backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    const newItem: OfflineBacklog = {
      id: generateId(),
      ...item,
      priority: item.priority ?? 1,
      syncStatus: item.syncStatus || 'pending',
      syncAttempts: item.syncAttempts ?? 0,
      queuedAt: new Date().toISOString(),
    };
    backlog.push(newItem);
    writeJsonFile('offline_backlog.json', backlog);
    return newItem;
  }

  async updateBacklogItem(id: string, item: Partial<InsertOfflineBacklog>): Promise<OfflineBacklog | undefined> {
    const backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    const index = backlog.findIndex(b => b.id === id);
    if (index < 0) return undefined;
    
    backlog[index] = { ...backlog[index], ...item, lastSyncAttempt: new Date().toISOString() };
    writeJsonFile('offline_backlog.json', backlog);
    return backlog[index];
  }

  async markBacklogSynced(id: string): Promise<void> {
    const backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    const index = backlog.findIndex(b => b.id === id);
    if (index >= 0) {
      backlog[index].syncStatus = 'synced';
      backlog[index].syncedAt = new Date().toISOString();
      writeJsonFile('offline_backlog.json', backlog);
    }
  }

  async deleteBacklogItem(id: string): Promise<void> {
    let backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    backlog = backlog.filter(b => b.id !== id);
    writeJsonFile('offline_backlog.json', backlog);
  }

  async clearSyncedBacklog(droneId?: string): Promise<void> {
    let backlog = readJsonFile<OfflineBacklog>('offline_backlog.json');
    if (droneId) {
      backlog = backlog.filter(b => b.droneId !== droneId || b.syncStatus !== 'synced');
    } else {
      backlog = backlog.filter(b => b.syncStatus !== 'synced');
    }
    writeJsonFile('offline_backlog.json', backlog);
  }

  // User Messages (Team Communication)
  async getAllMessages(): Promise<UserMessage[]> {
    const messages = readJsonFile<UserMessage>('messages.json');
    return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async createMessage(message: InsertUserMessage): Promise<UserMessage> {
    const messages = readJsonFile<UserMessage>('messages.json');
    const newMessage: UserMessage = {
      id: generateId(),
      ...message,
      timestamp: new Date().toISOString(),
      editedAt: null,
      deleted: false,
    };
    messages.push(newMessage);
    writeJsonFile('messages.json', messages);
    this.markSyncPending();
    return newMessage;
  }

  async updateMessage(id: string, content: string): Promise<UserMessage | undefined> {
    const messages = readJsonFile<UserMessage>('messages.json');
    const index = messages.findIndex(m => m.id === id);
    if (index < 0) return undefined;
    
    messages[index].content = content;
    messages[index].editedAt = new Date().toISOString();
    writeJsonFile('messages.json', messages);
    this.markSyncPending();
    return messages[index];
  }

  async deleteMessage(id: string): Promise<void> {
    const messages = readJsonFile<UserMessage>('messages.json');
    const index = messages.findIndex(m => m.id === id);
    if (index >= 0) {
      messages[index].deleted = true;
      messages[index].content = "[Message deleted]";
      writeJsonFile('messages.json', messages);
      this.markSyncPending();
    }
  }

  async syncMessagesToSheets(msgs: UserMessage[]): Promise<void> {
    // Save messages locally first
    writeJsonFile('messages.json', msgs);
    
    try {
      const sheetsClient = await getGoogleSheetsClient();
      if (!sheetsClient) {
        console.log('Google Sheets not available for message sync');
        return;
      }

      // Get or create a spreadsheet for messages
      const SPREADSHEET_NAME = 'MOUSE_GCS_Messages';
      
      // Search for existing spreadsheet
      const driveClient = await getGoogleDriveClient();
      if (!driveClient) return;
      
      const searchRes = await driveClient.files.list({
        q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
        fields: 'files(id)',
      });

      let spreadsheetId: string;
      
      if (searchRes.data.files && searchRes.data.files.length > 0) {
        spreadsheetId = searchRes.data.files[0].id!;
      } else {
        // Create new spreadsheet
        const createRes = await sheetsClient.spreadsheets.create({
          requestBody: {
            properties: { title: SPREADSHEET_NAME },
            sheets: [{ properties: { title: 'Messages' } }]
          }
        });
        spreadsheetId = createRes.data.spreadsheetId!;
      }

      // Prepare data for sheets
      const headers = ['ID', 'Sender ID', 'Sender Name', 'Sender Role', 'Content', 'Timestamp', 'Edited At', 'Deleted'];
      const rows = msgs.map(m => [
        m.id, m.senderId, m.senderName, m.senderRole, m.content, 
        m.timestamp, m.editedAt || '', m.deleted ? 'Yes' : 'No'
      ]);

      // Clear and update sheet
      await sheetsClient.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Messages!A:H',
      });

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: 'Messages!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers, ...rows]
        }
      });

      console.log(`Synced ${msgs.length} messages to Google Sheets`);
    } catch (error) {
      console.error('Failed to sync messages to Sheets:', error);
    }
  }

  // Sync management
  private markSyncPending() {
    this.syncPending = true;
  }

  // Sync data to Google Sheets/Drive
  async syncToGoogle(): Promise<void> {
    if (!this.syncPending) return;
    
    try {
      const sheetsClient = await getGoogleSheetsClient();
      const driveClient = await getGoogleDriveClient();
      
      if (!sheetsClient && !driveClient) {
        console.log('Google sync not available (offline mode)');
        return;
      }

      // Backup all JSON files to Google Drive
      if (driveClient) {
        const files = ['missions.json', 'drones.json', 'waypoints.json', 'settings.json', 'camera_settings.json'];
        for (const file of files) {
          const filepath = path.join(DATA_DIR, file);
          if (fs.existsSync(filepath)) {
            try {
              const content = fs.readFileSync(filepath, 'utf-8');
              
              // Search for existing file
              const searchRes = await driveClient.files.list({
                q: `name='mouse_gcs_${file}' and trashed=false`,
                fields: 'files(id)',
              });
              
              if (searchRes.data.files && searchRes.data.files.length > 0) {
                // Update existing file
                await driveClient.files.update({
                  fileId: searchRes.data.files[0].id!,
                  media: {
                    mimeType: 'application/json',
                    body: content,
                  },
                });
              } else {
                // Create new file
                await driveClient.files.create({
                  requestBody: {
                    name: `mouse_gcs_${file}`,
                    mimeType: 'application/json',
                  },
                  media: {
                    mimeType: 'application/json',
                    body: content,
                  },
                });
              }
              console.log(`Synced ${file} to Google Drive`);
            } catch (error) {
              console.error(`Failed to sync ${file} to Drive:`, error);
            }
          }
        }
      }

      this.syncPending = false;
      console.log('Google sync completed');
    } catch (error) {
      console.error('Google sync failed:', error);
    }
  }
}

export const storage = new FileStorage();

// Periodic sync to Google (every 5 minutes)
setInterval(() => {
  storage.syncToGoogle().catch(console.error);
}, 5 * 60 * 1000);
