import { getDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import type {
  Settings,
  InsertSettings,
  Mission,
  InsertMission,
  Waypoint,
  InsertWaypoint,
  FlightSession,
  InsertFlightSession,
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
} from '@shared/schema';
import type { IStorage } from './types.js';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function json(val: unknown): string {
  return val === undefined || val === null ? '' : JSON.stringify(val);
}

function parseJson<T>(val: string | null): T | undefined {
  if (!val) return undefined;
  try {
    return JSON.parse(val) as T;
  } catch {
    return undefined;
  }
}

export class DbStorage implements IStorage {
  private syncPending = false;

  constructor() {
    runMigrations();
  }

  private get db() {
    return getDb();
  }

  private markSyncPending() {
    this.syncPending = true;
  }

  // Settings
  async getSetting(key: string): Promise<Settings | undefined> {
    const row = this.db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      key: row.key,
      value: parseJson(row.value) ?? row.value,
      category: row.category,
      updatedAt: row.updatedAt,
    };
  }

  async getSettingsByCategory(category: string): Promise<Settings[]> {
    const rows = this.db.prepare('SELECT * FROM settings WHERE category = ?').all(category) as any[];
    return rows.map(r => ({
      id: r.id,
      key: r.key,
      value: parseJson(r.value) ?? r.value,
      category: r.category,
      updatedAt: r.updatedAt,
    }));
  }

  async upsertSetting(setting: InsertSettings): Promise<Settings> {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT id FROM settings WHERE key = ?').get(setting.key) as any;
    if (existing) {
      this.db.prepare(
        'UPDATE settings SET value = ?, category = ?, updatedAt = ? WHERE key = ?'
      ).run(json(setting.value), setting.category, now, setting.key);
      this.markSyncPending();
      return { id: existing.id, ...setting, updatedAt: now };
    }
    const id = generateId();
    this.db.prepare(
      'INSERT INTO settings (id, key, value, category, updatedAt) VALUES (?, ?, ?, ?, ?)'
    ).run(id, setting.key, json(setting.value), setting.category, now);
    this.markSyncPending();
    return { id, ...setting, updatedAt: now };
  }

  // Missions
  async getMission(id: string): Promise<Mission | undefined> {
    const row = this.db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as any;
    return row ? rowToMission(row) : undefined;
  }

  async getAllMissions(): Promise<Mission[]> {
    const rows = this.db.prepare('SELECT * FROM missions ORDER BY createdAt DESC').all() as any[];
    return rows.map(rowToMission);
  }

  async createMission(mission: InsertMission): Promise<Mission> {
    const now = new Date().toISOString();
    const id = generateId();
    const m = { id, ...mission, status: mission.status || 'planned', createdAt: now, updatedAt: now };
    this.db.prepare(
      'INSERT INTO missions (id, name, description, status, homeLatitude, homeLongitude, homeAltitude, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(m.id, m.name, m.description ?? null, m.status, m.homeLatitude, m.homeLongitude, m.homeAltitude ?? 0, m.createdAt, m.updatedAt);
    this.markSyncPending();
    return m;
  }

  async updateMission(id: string, mission: Partial<InsertMission>): Promise<Mission | undefined> {
    const existing = await this.getMission(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...mission, updatedAt: new Date().toISOString() };
    this.db.prepare(
      'UPDATE missions SET name = ?, description = ?, status = ?, homeLatitude = ?, homeLongitude = ?, homeAltitude = ?, updatedAt = ? WHERE id = ?'
    ).run(updated.name, updated.description ?? null, updated.status, updated.homeLatitude, updated.homeLongitude, updated.homeAltitude ?? 0, updated.updatedAt, id);
    this.markSyncPending();
    return updated;
  }

  async deleteMission(id: string): Promise<void> {
    this.db.prepare('DELETE FROM waypoints WHERE missionId = ?').run(id);
    this.db.prepare('DELETE FROM missions WHERE id = ?').run(id);
    this.markSyncPending();
  }

  // Waypoints
  async getWaypointsByMission(missionId: string): Promise<Waypoint[]> {
    const rows = this.db.prepare('SELECT * FROM waypoints WHERE missionId = ? ORDER BY "order"').all(missionId) as any[];
    return rows.map(rowToWaypoint);
  }

  async createWaypoint(waypoint: InsertWaypoint): Promise<Waypoint> {
    const id = generateId();
    const w = { id, ...waypoint };
    this.db.prepare(
      'INSERT INTO waypoints (id, missionId, "order", latitude, longitude, altitude, speed, action, actionParams, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(w.id, w.missionId, w.order, w.latitude, w.longitude, w.altitude, w.speed ?? null, w.action ?? null, json(w.actionParams), w.address ?? null);
    this.markSyncPending();
    return w;
  }

  async updateWaypoint(id: string, waypoint: Partial<InsertWaypoint>): Promise<Waypoint | undefined> {
    const existing = this.db.prepare('SELECT * FROM waypoints WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const updated = { ...rowToWaypoint(existing), ...waypoint };
    this.db.prepare(
      'UPDATE waypoints SET missionId = ?, "order" = ?, latitude = ?, longitude = ?, altitude = ?, speed = ?, action = ?, actionParams = ?, address = ? WHERE id = ?'
    ).run(updated.missionId, updated.order, updated.latitude, updated.longitude, updated.altitude, updated.speed ?? null, updated.action ?? null, json(updated.actionParams), updated.address ?? null, id);
    this.markSyncPending();
    return updated;
  }

  async deleteWaypoint(id: string): Promise<void> {
    this.db.prepare('DELETE FROM waypoints WHERE id = ?').run(id);
    this.markSyncPending();
  }

  async deleteWaypointsByMission(missionId: string): Promise<void> {
    this.db.prepare('DELETE FROM waypoints WHERE missionId = ?').run(missionId);
    this.markSyncPending();
  }

  // Flight Logs
  async createFlightLog(log: InsertFlightLog): Promise<FlightLog> {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const newLog: FlightLog = { id, ...log, armed: log.armed ?? false, timestamp } as FlightLog;
    this.db.prepare(
      `INSERT INTO flight_logs (id, sessionId, missionId, droneId, timestamp, latitude, longitude, altitude, relativeAltitude, heading, groundSpeed, verticalSpeed, airSpeed,
        batteryVoltage, batteryCurrent, batteryPercent, batteryTemp, gpsFixType, gpsSatellites, gpsHdop, flightMode, armed, pitch, roll, yaw,
        motor1Rpm, motor2Rpm, motor3Rpm, motor4Rpm, motor1Current, motor2Current, motor3Current, motor4Current, cpuTemp, vibrationX, vibrationY, vibrationZ,
        distanceFromHome, windSpeed, windDirection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, log.sessionId ?? null, log.missionId ?? null, log.droneId ?? null, timestamp,
      log.latitude ?? null, log.longitude ?? null, log.altitude ?? null, log.relativeAltitude ?? null, log.heading ?? null,
      log.groundSpeed ?? null, log.verticalSpeed ?? null, log.airSpeed ?? null,
      log.batteryVoltage ?? null, log.batteryCurrent ?? null, log.batteryPercent ?? null, log.batteryTemp ?? null,
      log.gpsFixType ?? null, log.gpsSatellites ?? null, log.gpsHdop ?? null, log.flightMode ?? null, (log.armed ?? false) ? 1 : 0,
      log.pitch ?? null, log.roll ?? null, log.yaw ?? null,
      log.motor1Rpm ?? null, log.motor2Rpm ?? null, log.motor3Rpm ?? null, log.motor4Rpm ?? null,
      log.motor1Current ?? null, log.motor2Current ?? null, log.motor3Current ?? null, log.motor4Current ?? null,
      log.cpuTemp ?? null, log.vibrationX ?? null, log.vibrationY ?? null, log.vibrationZ ?? null,
      log.distanceFromHome ?? null, log.windSpeed ?? null, log.windDirection ?? null
    );
    this.markSyncPending();
    return newLog;
  }

  async getFlightLogsByMission(missionId: string, limit = 100): Promise<FlightLog[]> {
    const rows = this.db.prepare(
      'SELECT * FROM flight_logs WHERE missionId = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(missionId, limit) as any[];
    return rows.map(rowToFlightLog);
  }

  async getRecentFlightLogs(limit: number): Promise<FlightLog[]> {
    const rows = this.db.prepare(
      'SELECT * FROM flight_logs ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(rowToFlightLog);
  }

  async deleteFlightLog(id: string): Promise<void> {
    this.db.prepare('DELETE FROM flight_logs WHERE id = ?').run(id);
    this.markSyncPending();
  }

  // Flight Sessions (extended API used by routes)
  async getFlightLogsBySession(sessionId: string): Promise<FlightLog[]> {
    const rows = this.db.prepare(
      'SELECT * FROM flight_logs WHERE sessionId = ? ORDER BY timestamp'
    ).all(sessionId) as any[];
    return rows.map(rowToFlightLog);
  }

  async createFlightSession(session: InsertFlightSession): Promise<FlightSession> {
    const id = generateId();
    const s = { id, ...session };
    this.db.prepare(
      `INSERT INTO flight_sessions (id, droneId, missionId, startTime, endTime, status, totalFlightTime, maxAltitude, totalDistance, videoFilePath, logFilePath, model3dFilePath,
        category, missionName, pilotName, pilotId, notes, weatherConditions, windSpeedAvg, temperatureC, rating, tags, takeoffLocation, landingLocation,
        batteryStartPercent, batteryEndPercent, waypointsCompleted, waypointsTotal, incidentReport) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, session.droneId ?? null, session.missionId ?? null, session.startTime, session.endTime ?? null,
      session.status ?? 'active', session.totalFlightTime ?? null, session.maxAltitude ?? null, session.totalDistance ?? null,
      session.videoFilePath ?? null, session.logFilePath ?? null, session.model3dFilePath ?? null,
      session.category ?? null, session.missionName ?? null, session.pilotName ?? null, session.pilotId ?? null,
      session.notes ?? null, session.weatherConditions ?? null, session.windSpeedAvg ?? null, session.temperatureC ?? null,
      session.rating ?? null, json(session.tags), session.takeoffLocation ?? null, session.landingLocation ?? null,
      session.batteryStartPercent ?? null, session.batteryEndPercent ?? null, session.waypointsCompleted ?? null,
      session.waypointsTotal ?? null, session.incidentReport ?? null
    );
    this.markSyncPending();
    return s as FlightSession;
  }

  async getFlightSession(id: string): Promise<FlightSession | undefined> {
    const row = this.db.prepare('SELECT * FROM flight_sessions WHERE id = ?').get(id) as any;
    return row ? rowToFlightSession(row) : undefined;
  }

  async getActiveFlightSession(droneId?: string): Promise<FlightSession | undefined> {
    const row = droneId
      ? this.db.prepare('SELECT * FROM flight_sessions WHERE status = ? AND droneId = ?').get('active', droneId) as any
      : this.db.prepare('SELECT * FROM flight_sessions WHERE status = ?').get('active') as any;
    return row ? rowToFlightSession(row) : undefined;
  }

  async getAllFlightSessions(): Promise<FlightSession[]> {
    const rows = this.db.prepare('SELECT * FROM flight_sessions ORDER BY startTime DESC').all() as any[];
    return rows.map(rowToFlightSession);
  }

  async updateFlightSession(id: string, updates: Partial<FlightSession>): Promise<FlightSession | undefined> {
    const existing = await this.getFlightSession(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.db.prepare(
      `UPDATE flight_sessions SET droneId = ?, missionId = ?, startTime = ?, endTime = ?, status = ?, totalFlightTime = ?, maxAltitude = ?, totalDistance = ?,
        videoFilePath = ?, logFilePath = ?, model3dFilePath = ?, category = ?, missionName = ?, pilotName = ?, pilotId = ?, notes = ?, weatherConditions = ?,
        windSpeedAvg = ?, temperatureC = ?, rating = ?, tags = ?, takeoffLocation = ?, landingLocation = ?, batteryStartPercent = ?, batteryEndPercent = ?,
        waypointsCompleted = ?, waypointsTotal = ?, incidentReport = ? WHERE id = ?`
    ).run(
      updated.droneId ?? null, updated.missionId ?? null, updated.startTime, updated.endTime ?? null, updated.status,
      updated.totalFlightTime ?? null, updated.maxAltitude ?? null, updated.totalDistance ?? null,
      updated.videoFilePath ?? null, updated.logFilePath ?? null, updated.model3dFilePath ?? null,
      updated.category ?? null, updated.missionName ?? null, updated.pilotName ?? null, updated.pilotId ?? null,
      updated.notes ?? null, updated.weatherConditions ?? null, updated.windSpeedAvg ?? null, updated.temperatureC ?? null,
      updated.rating ?? null, json(updated.tags), updated.takeoffLocation ?? null, updated.landingLocation ?? null,
      updated.batteryStartPercent ?? null, updated.batteryEndPercent ?? null, updated.waypointsCompleted ?? null,
      updated.waypointsTotal ?? null, updated.incidentReport ?? null, id
    );
    this.markSyncPending();
    return updated;
  }

  async endFlightSession(id: string, stats?: { maxAltitude?: number; totalDistance?: number; totalFlightTime?: number }): Promise<FlightSession | undefined> {
    const existing = await this.getFlightSession(id);
    if (!existing) return undefined;
    const updated = { ...existing, status: 'completed' as const, endTime: new Date().toISOString(), ...stats };
    return this.updateFlightSession(id, updated);
  }

  async deleteFlightSession(id: string): Promise<void> {
    this.db.prepare('DELETE FROM flight_sessions WHERE id = ?').run(id);
    this.markSyncPending();
  }

  // Sensor Data
  async createSensorData(data: InsertSensorData): Promise<SensorData> {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const newData: SensorData = { id, ...data, timestamp };
    this.db.prepare(
      'INSERT INTO sensor_data (id, timestamp, sensorType, sensorId, data) VALUES (?, ?, ?, ?, ?)'
    ).run(id, timestamp, data.sensorType, data.sensorId, json(data.data));
    return newData;
  }

  async getRecentSensorData(sensorType: string, limit: number): Promise<SensorData[]> {
    const rows = this.db.prepare(
      'SELECT * FROM sensor_data WHERE sensorType = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(sensorType, limit) as any[];
    return rows.map(r => ({ id: r.id, timestamp: r.timestamp, sensorType: r.sensorType, sensorId: r.sensorId, data: parseJson(r.data) }));
  }

  // Motor Telemetry
  async createMotorTelemetry(telemetry: InsertMotorTelemetry): Promise<MotorTelemetry> {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const newData: MotorTelemetry = { id, ...telemetry, timestamp } as MotorTelemetry;
    this.db.prepare(
      `INSERT INTO motor_telemetry (id, timestamp, motor1Rpm, motor2Rpm, motor3Rpm, motor4Rpm, motor1Temp, motor2Temp, motor3Temp, motor4Temp,
        motor1Current, motor2Current, motor3Current, motor4Current, escTemp, cpuTemp, vibrationX, vibrationY, vibrationZ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, timestamp,
      telemetry.motor1Rpm ?? null, telemetry.motor2Rpm ?? null, telemetry.motor3Rpm ?? null, telemetry.motor4Rpm ?? null,
      telemetry.motor1Temp ?? null, telemetry.motor2Temp ?? null, telemetry.motor3Temp ?? null, telemetry.motor4Temp ?? null,
      telemetry.motor1Current ?? null, telemetry.motor2Current ?? null, telemetry.motor3Current ?? null, telemetry.motor4Current ?? null,
      telemetry.escTemp ?? null, telemetry.cpuTemp ?? null, telemetry.vibrationX ?? null, telemetry.vibrationY ?? null, telemetry.vibrationZ ?? null
    );
    return newData;
  }

  async getRecentMotorTelemetry(limit: number): Promise<MotorTelemetry[]> {
    const rows = this.db.prepare(
      'SELECT * FROM motor_telemetry ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(rowToMotorTelemetry);
  }

  // Camera Settings (scoped by droneId)
  async getCameraSettings(droneId?: string): Promise<CameraSettings | undefined> {
    const drId = String(droneId || "").trim() || null;
    const row = this.db.prepare(
      'SELECT * FROM camera_settings WHERE (droneId IS NULL AND ? IS NULL) OR droneId = ? LIMIT 1'
    ).get(drId, drId || null) as any;
    if (!row) {
      if (!drId) {
        const defaults: CameraSettings = {
          id: generateId(),
          activeCamera: 'gimbal',
          trackingEnabled: false,
          model: 'Skydroid C12',
          resolution: '2K HD (2560x1440)',
          thermalResolution: '384x288',
          lens: '7mm',
          streamUrl: '',
          streamEnabled: false,
          recordingEnabled: false,
          updatedAt: new Date().toISOString(),
        };
        this.db.prepare(
          'INSERT INTO camera_settings (id, activeCamera, trackingEnabled, model, resolution, thermalResolution, lens, streamUrl, streamEnabled, recordingEnabled, droneId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(defaults.id, defaults.activeCamera, 0, defaults.model, defaults.resolution, defaults.thermalResolution, defaults.lens, defaults.streamUrl, 0, 0, null, defaults.updatedAt);
        return defaults;
      }
      return undefined;
    }
    return rowToCameraSettings(row);
  }

  async updateCameraSettings(settings: Partial<InsertCameraSettings>, droneId?: string): Promise<CameraSettings> {
    const drId = String(droneId || "").trim() || null;
    const existing = await this.getCameraSettings(droneId);
    if (!existing && drId) {
      const defaults: CameraSettings = {
        id: generateId(),
        activeCamera: 'gimbal',
        trackingEnabled: false,
        model: 'Skydroid C12',
        resolution: '2K HD (2560x1440)',
        thermalResolution: '384x288',
        lens: '7mm',
        streamUrl: '',
        streamEnabled: false,
        recordingEnabled: false,
        updatedAt: new Date().toISOString(),
      };
      const updated: CameraSettings = { ...defaults, ...settings, updatedAt: new Date().toISOString() };
      this.db.prepare(
        'INSERT INTO camera_settings (id, activeCamera, trackingEnabled, model, resolution, thermalResolution, lens, streamUrl, streamEnabled, recordingEnabled, droneId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(updated.id, updated.activeCamera, updated.trackingEnabled ? 1 : 0, updated.model, updated.resolution, updated.thermalResolution, updated.lens, updated.streamUrl, updated.streamEnabled ? 1 : 0, updated.recordingEnabled ? 1 : 0, drId, updated.updatedAt);
      this.markSyncPending();
      return updated;
    }
    const updated: CameraSettings = { ...existing!, ...settings, updatedAt: new Date().toISOString() };
    this.db.prepare(
      `UPDATE camera_settings SET activeCamera = ?, trackingEnabled = ?, trackingTarget = ?, trackingConfidence = ?, gimbalPitch = ?, gimbalYaw = ?,
        model = ?, resolution = ?, thermalResolution = ?, lens = ?, streamUrl = ?, streamEnabled = ?, recordingEnabled = ?, updatedAt = ? WHERE id = ?`
    ).run(
      updated.activeCamera, updated.trackingEnabled ? 1 : 0, updated.trackingTarget ?? null, updated.trackingConfidence ?? null,
      updated.gimbalPitch ?? null, updated.gimbalYaw ?? null, updated.model ?? null, updated.resolution ?? null,
      updated.thermalResolution ?? null, updated.lens ?? null, updated.streamUrl ?? null, updated.streamEnabled ? 1 : 0,
      updated.recordingEnabled ? 1 : 0, updated.updatedAt, updated.id
    );
    this.markSyncPending();
    return updated;
  }

  // Drones
  async getDrone(id: string): Promise<Drone | undefined> {
    const row = this.db.prepare('SELECT * FROM drones WHERE id = ?').get(id) as any;
    return row ? rowToDrone(row) : undefined;
  }

  async getDroneByCallsign(callsign: string): Promise<Drone | undefined> {
    const row = this.db.prepare('SELECT * FROM drones WHERE callsign = ?').get(callsign) as any;
    return row ? rowToDrone(row) : undefined;
  }

  async getAllDrones(): Promise<Drone[]> {
    const rows = this.db.prepare('SELECT * FROM drones ORDER BY updatedAt DESC').all() as any[];
    return rows.map(rowToDrone);
  }

  async createDrone(drone: InsertDrone): Promise<Drone> {
    const now = new Date().toISOString();
    const id = generateId();
    const d: Drone = {
      id,
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
    this.db.prepare(
      `INSERT INTO drones (id, name, callsign, model, status, connectionType, connectionString, latitude, longitude, altitude, heading, batteryPercent, signalStrength,
        gpsStatus, currentMissionId, currentWaypointIndex, geofenceEnabled, geofenceData, motorCount, hasGripper, hasCamera, hasThermal, hasLidar, maxSpeed, maxAltitude, rtlAltitude, createdAt, updatedAt, lastSeen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      d.id, d.name, d.callsign, d.model, d.status, d.connectionType ?? null, d.connectionString ?? null,
      d.latitude ?? null, d.longitude ?? null, d.altitude ?? null, d.heading ?? null, d.batteryPercent ?? null, d.signalStrength ?? null,
      d.gpsStatus, d.currentMissionId ?? null, d.currentWaypointIndex ?? null, d.geofenceEnabled ? 1 : 0, json(d.geofenceData),
      d.motorCount, d.hasGripper ? 1 : 0, d.hasCamera ? 1 : 0, d.hasThermal ? 1 : 0, d.hasLidar ? 1 : 0,
      d.maxSpeed, d.maxAltitude, d.rtlAltitude, d.createdAt, d.updatedAt, d.lastSeen ?? null
    );
    this.markSyncPending();
    return d;
  }

  async updateDrone(id: string, drone: Partial<InsertDrone>): Promise<Drone | undefined> {
    const existing = await this.getDrone(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...drone, updatedAt: new Date().toISOString() };
    this.db.prepare(
      `UPDATE drones SET name = ?, callsign = ?, model = ?, status = ?, connectionType = ?, connectionString = ?, latitude = ?, longitude = ?, altitude = ?, heading = ?,
        batteryPercent = ?, signalStrength = ?, gpsStatus = ?, currentMissionId = ?, currentWaypointIndex = ?, geofenceEnabled = ?, geofenceData = ?,
        motorCount = ?, hasGripper = ?, hasCamera = ?, hasThermal = ?, hasLidar = ?, maxSpeed = ?, maxAltitude = ?, rtlAltitude = ?, updatedAt = ?, lastSeen = ? WHERE id = ?`
    ).run(
      updated.name, updated.callsign, updated.model, updated.status, updated.connectionType ?? null, updated.connectionString ?? null,
      updated.latitude ?? null, updated.longitude ?? null, updated.altitude ?? null, updated.heading ?? null,
      updated.batteryPercent ?? null, updated.signalStrength ?? null, updated.gpsStatus ?? 'no_fix',
      updated.currentMissionId ?? null, updated.currentWaypointIndex ?? null, updated.geofenceEnabled ? 1 : 0, json(updated.geofenceData),
      updated.motorCount ?? 4, updated.hasGripper ? 1 : 0, updated.hasCamera ? 1 : 0, updated.hasThermal ? 1 : 0, updated.hasLidar ? 1 : 0,
      updated.maxSpeed ?? 15, updated.maxAltitude ?? 120, updated.rtlAltitude ?? 50, updated.updatedAt, updated.lastSeen ?? null, id
    );
    this.markSyncPending();
    return updated;
  }

  async updateDroneLocation(id: string, latitude: number, longitude: number, altitude: number, heading: number): Promise<Drone | undefined> {
    const existing = await this.getDrone(id);
    if (!existing) return undefined;
    this.db.prepare('UPDATE drones SET latitude = ?, longitude = ?, altitude = ?, heading = ?, updatedAt = ? WHERE id = ?')
      .run(latitude, longitude, altitude, heading, new Date().toISOString(), id);
    this.markSyncPending();
    return { ...existing, latitude, longitude, altitude, heading, updatedAt: new Date().toISOString() };
  }

  async deleteDrone(id: string): Promise<void> {
    this.db.prepare('DELETE FROM drones WHERE id = ?').run(id);
    this.markSyncPending();
  }

  // Media Assets
  async getMediaAsset(id: string): Promise<MediaAsset | undefined> {
    const row = this.db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
    return row ? rowToMediaAsset(row) : undefined;
  }

  async getMediaAssetsByDrone(droneId: string, limit = 100): Promise<MediaAsset[]> {
    const rows = droneId
      ? (this.db.prepare('SELECT * FROM media_assets WHERE droneId = ? ORDER BY capturedAt DESC LIMIT ?').all(droneId, limit) as any[])
      : (this.db.prepare('SELECT * FROM media_assets ORDER BY capturedAt DESC LIMIT ?').all(limit) as any[]);
    return rows.map(rowToMediaAsset);
  }

  async getMediaAssetsBySession(sessionId: string): Promise<MediaAsset[]> {
    const rows = this.db.prepare('SELECT * FROM media_assets WHERE sessionId = ? ORDER BY capturedAt DESC').all(sessionId) as any[];
    return rows.map(rowToMediaAsset);
  }

  async getPendingMediaAssets(): Promise<MediaAsset[]> {
    const rows = this.db.prepare('SELECT * FROM media_assets WHERE syncStatus = ?').all('pending') as any[];
    return rows.map(rowToMediaAsset);
  }

  async createMediaAsset(asset: InsertMediaAsset): Promise<MediaAsset> {
    const id = generateId();
    const a = { id, ...asset, syncStatus: asset.syncStatus || 'synced', createdAt: new Date().toISOString() };
    this.db.prepare(
      `INSERT INTO media_assets (id, droneId, sessionId, type, filename, storagePath, driveFileId, driveLink, mimeType, fileSize, duration, latitude, longitude, altitude, heading, cameraMode, zoomLevel, syncStatus, syncError, capturedAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, asset.droneId ?? null, asset.sessionId ?? null, asset.type, asset.filename, asset.storagePath ?? null,
      asset.driveFileId ?? null, asset.driveLink ?? null, asset.mimeType, asset.fileSize ?? null, asset.duration ?? null,
      asset.latitude ?? null, asset.longitude ?? null, asset.altitude ?? null, asset.heading ?? null,
      asset.cameraMode ?? null, asset.zoomLevel ?? null, a.syncStatus, asset.syncError ?? null, asset.capturedAt, a.createdAt
    );
    this.markSyncPending();
    return a as MediaAsset;
  }

  async updateMediaAsset(id: string, asset: Partial<InsertMediaAsset>): Promise<MediaAsset | undefined> {
    const existing = await this.getMediaAsset(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...asset };
    this.db.prepare(
      `UPDATE media_assets SET droneId = ?, sessionId = ?, type = ?, filename = ?, storagePath = ?, driveFileId = ?, driveLink = ?, mimeType = ?, fileSize = ?, duration = ?,
        latitude = ?, longitude = ?, altitude = ?, heading = ?, cameraMode = ?, zoomLevel = ?, syncStatus = ?, syncError = ?, capturedAt = ? WHERE id = ?`
    ).run(
      updated.droneId ?? null, updated.sessionId ?? null, updated.type, updated.filename, updated.storagePath ?? null,
      updated.driveFileId ?? null, updated.driveLink ?? null, updated.mimeType, updated.fileSize ?? null, updated.duration ?? null,
      updated.latitude ?? null, updated.longitude ?? null, updated.altitude ?? null, updated.heading ?? null,
      updated.cameraMode ?? null, updated.zoomLevel ?? null, updated.syncStatus ?? 'synced', updated.syncError ?? null, updated.capturedAt, id
    );
    this.markSyncPending();
    return updated;
  }

  async deleteMediaAsset(id: string): Promise<void> {
    this.db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
    this.markSyncPending();
  }

  // Offline Backlog
  async getBacklogItem(id: string): Promise<OfflineBacklog | undefined> {
    const row = this.db.prepare('SELECT * FROM offline_backlog WHERE id = ?').get(id) as any;
    return row ? rowToOfflineBacklog(row) : undefined;
  }

  async getPendingBacklog(droneId?: string): Promise<OfflineBacklog[]> {
    const rows = droneId
      ? this.db.prepare('SELECT * FROM offline_backlog WHERE syncStatus = ? AND droneId = ?').all('pending', droneId) as any[]
      : this.db.prepare('SELECT * FROM offline_backlog WHERE syncStatus = ?').all('pending') as any[];
    return rows.map(rowToOfflineBacklog);
  }

  async createBacklogItem(item: InsertOfflineBacklog): Promise<OfflineBacklog> {
    const id = generateId();
    const queuedAt = new Date().toISOString();
    const b: OfflineBacklog = { id, ...item, priority: item.priority ?? 1, syncStatus: 'pending', syncAttempts: 0, queuedAt };
    this.db.prepare(
      'INSERT INTO offline_backlog (id, clientRequestId, droneId, dataType, data, priority, localFilePath, fileChecksum, syncStatus, syncAttempts, recordedAt, queuedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, item.clientRequestId ?? null, item.droneId ?? null, item.dataType, json(item.data), b.priority, item.localFilePath ?? null, item.fileChecksum ?? null, 'pending', 0, item.recordedAt, queuedAt);
    this.markSyncPending();
    return b;
  }

  async updateBacklogItem(id: string, item: Partial<InsertOfflineBacklog>): Promise<OfflineBacklog | undefined> {
    const existing = await this.getBacklogItem(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...item };
    this.db.prepare(
      'UPDATE offline_backlog SET clientRequestId = ?, droneId = ?, dataType = ?, data = ?, priority = ?, localFilePath = ?, fileChecksum = ?, syncStatus = ?, syncAttempts = ?, lastSyncAttempt = ?, syncError = ?, recordedAt = ? WHERE id = ?'
    ).run(
      updated.clientRequestId ?? null, updated.droneId ?? null, updated.dataType, json(updated.data), updated.priority ?? 1,
      updated.localFilePath ?? null, updated.fileChecksum ?? null, updated.syncStatus ?? 'pending', updated.syncAttempts ?? 0,
      updated.lastSyncAttempt ?? null, updated.syncError ?? null, updated.recordedAt, id
    );
    this.markSyncPending();
    return updated;
  }

  async markBacklogSynced(id: string): Promise<void> {
    this.db.prepare('UPDATE offline_backlog SET syncStatus = ?, syncedAt = ? WHERE id = ?').run('synced', new Date().toISOString(), id);
    this.markSyncPending();
  }

  async deleteBacklogItem(id: string): Promise<void> {
    this.db.prepare('DELETE FROM offline_backlog WHERE id = ?').run(id);
    this.markSyncPending();
  }

  async clearSyncedBacklog(droneId?: string): Promise<void> {
    if (droneId) {
      this.db.prepare('DELETE FROM offline_backlog WHERE droneId = ? AND syncStatus = ?').run(droneId, 'synced');
    } else {
      this.db.prepare('DELETE FROM offline_backlog WHERE syncStatus = ?').run('synced');
    }
    this.markSyncPending();
  }

  // User Messages
  async getAllMessages(): Promise<UserMessage[]> {
    const rows = this.db.prepare('SELECT * FROM messages ORDER BY timestamp').all() as any[];
    return rows.map(rowToUserMessage);
  }

  async getAllMessagesWithHistory(): Promise<UserMessage[]> {
    return this.getAllMessages();
  }

  async getMessagesForUser(userId: string): Promise<UserMessage[]> {
    const all = await this.getAllMessages();
    return all.filter(m => {
      const recipientIds = Array.isArray(m.recipients)
        ? (m.recipients as { id: string }[]).filter(r => r?.id).map(r => String(r.id))
        : [];
      const isBroadcast = !m.recipientId && recipientIds.length === 0;
      const isDirectRecipient = Boolean(m.recipientId && String(m.recipientId) === userId);
      const isMultiRecipient = recipientIds.includes(userId);
      return isBroadcast || m.senderId === userId || isDirectRecipient || isMultiRecipient;
    });
  }

  async getMessageById(id: string): Promise<UserMessage | undefined> {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;
    return row ? rowToUserMessage(row) : undefined;
  }

  async getChatUsers(): Promise<{ id: string; username: string; role: string }[]> {
    const rows = this.db.prepare('SELECT DISTINCT senderId, senderName, senderRole FROM messages').all() as any[];
    const map = new Map<string, { id: string; username: string; role: string }>();
    for (const r of rows) {
      if (!map.has(r.senderId)) map.set(r.senderId, { id: r.senderId, username: r.senderName, role: r.senderRole });
    }
    return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
  }

  async createMessage(message: InsertUserMessage): Promise<UserMessage> {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const m: UserMessage = { id, ...message, timestamp, editedAt: null, deleted: false };
    this.db.prepare(
      'INSERT INTO messages (id, senderId, senderName, senderRole, recipientId, recipientName, recipients, content, originalContent, timestamp, editedAt, deleted, deletedAt, deletedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, message.senderId, message.senderName, message.senderRole, message.recipientId ?? null, message.recipientName ?? null, json(message.recipients), message.content, message.originalContent ?? null, timestamp, null, 0, null, null);
    this.markSyncPending();
    return m;
  }

  async updateMessage(id: string, content: string): Promise<UserMessage | undefined> {
    const existing = await this.getMessageById(id);
    if (!existing) return undefined;
    const originalContent = existing.originalContent ?? existing.content;
    this.db.prepare('UPDATE messages SET content = ?, originalContent = ?, editedAt = ? WHERE id = ?')
      .run(content, originalContent, new Date().toISOString(), id);
    this.markSyncPending();
    return { ...existing, content, originalContent, editedAt: new Date().toISOString() };
  }

  async deleteMessage(id: string, deletedBy?: string): Promise<void> {
    const existing = await this.getMessageById(id);
    if (existing) {
      const originalContent = existing.originalContent ?? existing.content;
      this.db.prepare('UPDATE messages SET content = ?, originalContent = ?, deleted = ?, deletedAt = ?, deletedBy = ? WHERE id = ?')
        .run('[Message deleted]', originalContent, 1, new Date().toISOString(), deletedBy ?? null, id);
      this.markSyncPending();
    }
  }

  async syncMessagesToSheets(messages: UserMessage[]): Promise<void> {
    // DbStorage delegates to Google Sheets - same as FileStorage; requires external integration
    // For now, no-op; storage.ts has the full implementation with Google Drive/Sheets
    console.log('syncMessagesToSheets: Google Sheets integration not available in DbStorage');
  }

  async syncToGoogle(): Promise<void> {
    if (!this.syncPending) return;
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const hasReplitToken = process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL;
    if (!hostname || !hasReplitToken) {
      this.syncPending = false;
      return;
    }
    // DbStorage uses DB; Google sync would need to export from DB - for now no-op
    this.syncPending = false;
  }
}

// Row mappers
function rowToMission(r: any): Mission {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    homeLatitude: r.homeLatitude,
    homeLongitude: r.homeLongitude,
    homeAltitude: r.homeAltitude ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function rowToWaypoint(r: any): Waypoint {
  return {
    id: r.id,
    missionId: r.missionId,
    order: r.order,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    speed: r.speed,
    action: r.action,
    actionParams: parseJson(r.actionParams),
    address: r.address,
  };
}

function rowToFlightLog(r: any): FlightLog {
  return {
    id: r.id,
    sessionId: r.sessionId,
    missionId: r.missionId,
    droneId: r.droneId,
    timestamp: r.timestamp,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    relativeAltitude: r.relativeAltitude,
    heading: r.heading,
    groundSpeed: r.groundSpeed,
    verticalSpeed: r.verticalSpeed,
    airSpeed: r.airSpeed,
    batteryVoltage: r.batteryVoltage,
    batteryCurrent: r.batteryCurrent,
    batteryPercent: r.batteryPercent,
    batteryTemp: r.batteryTemp,
    gpsFixType: r.gpsFixType,
    gpsSatellites: r.gpsSatellites,
    gpsHdop: r.gpsHdop,
    flightMode: r.flightMode,
    armed: Boolean(r.armed),
    pitch: r.pitch,
    roll: r.roll,
    yaw: r.yaw,
    motor1Rpm: r.motor1Rpm,
    motor2Rpm: r.motor2Rpm,
    motor3Rpm: r.motor3Rpm,
    motor4Rpm: r.motor4Rpm,
    motor1Current: r.motor1Current,
    motor2Current: r.motor2Current,
    motor3Current: r.motor3Current,
    motor4Current: r.motor4Current,
    cpuTemp: r.cpuTemp,
    vibrationX: r.vibrationX,
    vibrationY: r.vibrationY,
    vibrationZ: r.vibrationZ,
    distanceFromHome: r.distanceFromHome,
    windSpeed: r.windSpeed,
    windDirection: r.windDirection,
  };
}

function rowToFlightSession(r: any): FlightSession {
  return {
    id: r.id,
    droneId: r.droneId,
    missionId: r.missionId,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    totalFlightTime: r.totalFlightTime,
    maxAltitude: r.maxAltitude,
    totalDistance: r.totalDistance,
    videoFilePath: r.videoFilePath,
    logFilePath: r.logFilePath,
    model3dFilePath: r.model3dFilePath,
    category: r.category,
    missionName: r.missionName,
    pilotName: r.pilotName,
    pilotId: r.pilotId,
    notes: r.notes,
    weatherConditions: r.weatherConditions,
    windSpeedAvg: r.windSpeedAvg,
    temperatureC: r.temperatureC,
    rating: r.rating,
    tags: parseJson(r.tags),
    takeoffLocation: r.takeoffLocation,
    landingLocation: r.landingLocation,
    batteryStartPercent: r.batteryStartPercent,
    batteryEndPercent: r.batteryEndPercent,
    waypointsCompleted: r.waypointsCompleted,
    waypointsTotal: r.waypointsTotal,
    incidentReport: r.incidentReport,
  };
}

function rowToMotorTelemetry(r: any): MotorTelemetry {
  return {
    id: r.id,
    timestamp: r.timestamp,
    motor1Rpm: r.motor1Rpm,
    motor2Rpm: r.motor2Rpm,
    motor3Rpm: r.motor3Rpm,
    motor4Rpm: r.motor4Rpm,
    motor1Temp: r.motor1Temp,
    motor2Temp: r.motor2Temp,
    motor3Temp: r.motor3Temp,
    motor4Temp: r.motor4Temp,
    motor1Current: r.motor1Current,
    motor2Current: r.motor2Current,
    motor3Current: r.motor3Current,
    motor4Current: r.motor4Current,
    escTemp: r.escTemp,
    cpuTemp: r.cpuTemp,
    vibrationX: r.vibrationX,
    vibrationY: r.vibrationY,
    vibrationZ: r.vibrationZ,
  };
}

function rowToCameraSettings(r: any): CameraSettings {
  return {
    id: r.id,
    activeCamera: r.activeCamera ?? 'gimbal',
    trackingEnabled: Boolean(r.trackingEnabled),
    trackingTarget: r.trackingTarget,
    trackingConfidence: r.trackingConfidence,
    gimbalPitch: r.gimbalPitch,
    gimbalYaw: r.gimbalYaw,
    model: r.model,
    resolution: r.resolution,
    thermalResolution: r.thermalResolution,
    lens: r.lens,
    streamUrl: r.streamUrl,
    streamEnabled: r.streamEnabled ?? false,
    recordingEnabled: Boolean(r.recordingEnabled),
    updatedAt: r.updatedAt,
  };
}

function rowToDrone(r: any): Drone {
  return {
    id: r.id,
    name: r.name,
    callsign: r.callsign,
    model: r.model ?? 'Custom',
    status: r.status ?? 'offline',
    connectionType: r.connectionType ?? 'mavlink',
    connectionString: r.connectionString,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    heading: r.heading,
    batteryPercent: r.batteryPercent,
    signalStrength: r.signalStrength,
    gpsStatus: r.gpsStatus ?? 'no_fix',
    currentMissionId: r.currentMissionId,
    currentWaypointIndex: r.currentWaypointIndex,
    geofenceEnabled: Boolean(r.geofenceEnabled),
    geofenceData: parseJson(r.geofenceData),
    motorCount: r.motorCount ?? 4,
    hasGripper: Boolean(r.hasGripper),
    hasCamera: r.hasCamera !== 0,
    hasThermal: Boolean(r.hasThermal),
    hasLidar: Boolean(r.hasLidar),
    maxSpeed: r.maxSpeed ?? 15,
    maxAltitude: r.maxAltitude ?? 120,
    rtlAltitude: r.rtlAltitude ?? 50,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastSeen: r.lastSeen,
  };
}

function rowToMediaAsset(r: any): MediaAsset {
  return {
    id: r.id,
    droneId: r.droneId,
    sessionId: r.sessionId,
    type: r.type,
    filename: r.filename,
    storagePath: r.storagePath,
    driveFileId: r.driveFileId,
    driveLink: r.driveLink,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    duration: r.duration,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    heading: r.heading,
    cameraMode: r.cameraMode,
    zoomLevel: r.zoomLevel,
    syncStatus: r.syncStatus ?? 'synced',
    syncError: r.syncError,
    capturedAt: r.capturedAt,
    createdAt: r.createdAt,
  };
}

function rowToOfflineBacklog(r: any): OfflineBacklog {
  return {
    id: r.id,
    clientRequestId: r.clientRequestId,
    droneId: r.droneId,
    dataType: r.dataType,
    data: parseJson(r.data),
    priority: r.priority ?? 1,
    localFilePath: r.localFilePath,
    fileChecksum: r.fileChecksum,
    syncStatus: r.syncStatus ?? 'pending',
    syncAttempts: r.syncAttempts ?? 0,
    lastSyncAttempt: r.lastSyncAttempt,
    syncError: r.syncError,
    recordedAt: r.recordedAt,
    queuedAt: r.queuedAt,
    syncedAt: r.syncedAt,
  };
}

function rowToUserMessage(r: any): UserMessage {
  return {
    id: r.id,
    senderId: r.senderId,
    senderName: r.senderName,
    senderRole: r.senderRole,
    recipientId: r.recipientId,
    recipientName: r.recipientName,
    recipients: parseJson(r.recipients),
    content: r.content,
    originalContent: r.originalContent,
    timestamp: r.timestamp,
    editedAt: r.editedAt,
    deleted: Boolean(r.deleted),
    deletedAt: r.deletedAt,
    deletedBy: r.deletedBy,
  };
}
