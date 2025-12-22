import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, real, timestamp, boolean, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// System Settings
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: json("value").notNull(),
  category: text("category").notNull(), // 'connection', 'sensor', 'input', 'camera', 'audio'
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

// Flight Missions
export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planned"), // 'planned', 'active', 'completed', 'aborted'
  homeLatitude: real("home_latitude").notNull(),
  homeLongitude: real("home_longitude").notNull(),
  homeAltitude: real("home_altitude").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMissionSchema = createInsertSchema(missions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type Mission = typeof missions.$inferSelect;

// Mission Waypoints
export const waypoints = pgTable("waypoints", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  altitude: real("altitude").notNull(),
  speed: real("speed"),
  action: text("action"), // 'flythrough', 'hover', 'photo', 'drop_payload', 'pickup_payload', 'rtl', 'alert', 'patrol'
  actionParams: json("action_params"), // { hoverTime: number, alertMessage: string, patrolRadius: number }
  address: text("address"), // Saved address for reference
});

// Flight Sessions for comprehensive logging
export const flightSessions = pgTable("flight_sessions", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").references(() => missions.id, { onDelete: "set null" }),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  status: text("status").notNull().default("active"), // 'active', 'completed', 'aborted'
  totalFlightTime: integer("total_flight_time"), // seconds
  maxAltitude: real("max_altitude"),
  totalDistance: real("total_distance"), // meters
  videoFilePath: text("video_file_path"),
  logFilePath: text("log_file_path"),
  model3dFilePath: text("model_3d_file_path"),
});

export const insertFlightSessionSchema = createInsertSchema(flightSessions).omit({ id: true });
export type InsertFlightSession = z.infer<typeof insertFlightSessionSchema>;
export type FlightSession = typeof flightSessions.$inferSelect;

// Flight Events (commands, alerts, waypoint arrivals)
export const flightEvents = pgTable("flight_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => flightSessions.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  eventType: text("event_type").notNull(), // 'command', 'alert', 'waypoint_arrival', 'mode_change', 'error'
  eventData: json("event_data").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  altitude: real("altitude"),
});

export const insertFlightEventSchema = createInsertSchema(flightEvents).omit({ id: true, timestamp: true });
export type InsertFlightEvent = z.infer<typeof insertFlightEventSchema>;
export type FlightEvent = typeof flightEvents.$inferSelect;

export const insertWaypointSchema = createInsertSchema(waypoints).omit({ id: true });
export type InsertWaypoint = z.infer<typeof insertWaypointSchema>;
export type Waypoint = typeof waypoints.$inferSelect;

// Flight Logs (Telemetry History)
export const flightLogs = pgTable("flight_logs", {
  id: serial("id").primaryKey(),
  missionId: integer("mission_id").references(() => missions.id, { onDelete: "set null" }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  altitude: real("altitude"),
  heading: real("heading"),
  groundSpeed: real("ground_speed"),
  verticalSpeed: real("vertical_speed"),
  batteryVoltage: real("battery_voltage"),
  batteryCurrent: real("battery_current"),
  batteryPercent: integer("battery_percent"),
  gpsFixType: integer("gps_fix_type"),
  gpsSatellites: integer("gps_satellites"),
  flightMode: text("flight_mode"),
  armed: boolean("armed").default(false),
  pitch: real("pitch"),
  roll: real("roll"),
  yaw: real("yaw"),
});

export const insertFlightLogSchema = createInsertSchema(flightLogs).omit({ id: true, timestamp: true });
export type InsertFlightLog = z.infer<typeof insertFlightLogSchema>;
export type FlightLog = typeof flightLogs.$inferSelect;

// Sensor Data
export const sensorData = pgTable("sensor_data", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  sensorType: text("sensor_type").notNull(), // 'lidar', 'thermal', 'imu', 'barometer', 'custom'
  sensorId: text("sensor_id").notNull(),
  data: json("data").notNull(),
});

export const insertSensorDataSchema = createInsertSchema(sensorData).omit({ id: true, timestamp: true });
export type InsertSensorData = z.infer<typeof insertSensorDataSchema>;
export type SensorData = typeof sensorData.$inferSelect;

// Motor/ESC Telemetry
export const motorTelemetry = pgTable("motor_telemetry", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  motor1Rpm: integer("motor1_rpm"),
  motor2Rpm: integer("motor2_rpm"),
  motor3Rpm: integer("motor3_rpm"),
  motor4Rpm: integer("motor4_rpm"),
  motor1Temp: real("motor1_temp"),
  motor2Temp: real("motor2_temp"),
  motor3Temp: real("motor3_temp"),
  motor4Temp: real("motor4_temp"),
  motor1Current: real("motor1_current"),
  motor2Current: real("motor2_current"),
  motor3Current: real("motor3_current"),
  motor4Current: real("motor4_current"),
  escTemp: real("esc_temp"),
  cpuTemp: real("cpu_temp"),
  vibrationX: real("vibration_x"),
  vibrationY: real("vibration_y"),
  vibrationZ: real("vibration_z"),
});

export const insertMotorTelemetrySchema = createInsertSchema(motorTelemetry).omit({ id: true, timestamp: true });
export type InsertMotorTelemetry = z.infer<typeof insertMotorTelemetrySchema>;
export type MotorTelemetry = typeof motorTelemetry.$inferSelect;

// Camera/Tracking Settings
export const cameraSettings = pgTable("camera_settings", {
  id: serial("id").primaryKey(),
  activeCamera: text("active_camera").notNull().default("gimbal"), // 'gimbal', 'thermal', 'fpv'
  trackingEnabled: boolean("tracking_enabled").default(false),
  trackingTarget: text("tracking_target"), // 'person', 'vehicle', 'custom'
  trackingConfidence: real("tracking_confidence"),
  gimbalPitch: real("gimbal_pitch"),
  gimbalYaw: real("gimbal_yaw"),
  recordingEnabled: boolean("recording_enabled").default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCameraSettingsSchema = createInsertSchema(cameraSettings).omit({ id: true, updatedAt: true });
export type InsertCameraSettings = z.infer<typeof insertCameraSettingsSchema>;
export type CameraSettings = typeof cameraSettings.$inferSelect;

// Connected Drones
export const drones = pgTable("drones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  callsign: text("callsign").notNull().unique(), // Unique identifier like "ALPHA-1", "BRAVO-2"
  model: text("model").notNull().default("Custom"), // "DJI Mavic", "Custom Hexacopter", etc.
  status: text("status").notNull().default("offline"), // 'online', 'offline', 'armed', 'flying', 'error', 'maintenance'
  connectionType: text("connection_type").notNull().default("mavlink"), // 'mavlink', 'dji_sdk', 'custom'
  connectionString: text("connection_string"), // UDP/TCP endpoint, serial port, etc.
  
  // Current location (updated in real-time)
  latitude: real("latitude"),
  longitude: real("longitude"),
  altitude: real("altitude"),
  heading: real("heading"),
  
  // Battery and health
  batteryPercent: integer("battery_percent"),
  signalStrength: integer("signal_strength"), // 0-100
  gpsStatus: text("gps_status").default("no_fix"), // 'no_fix', '2d_fix', '3d_fix', 'dgps', 'rtk_fixed'
  
  // Current mission info
  currentMissionId: integer("current_mission_id").references(() => missions.id, { onDelete: "set null" }),
  currentWaypointIndex: integer("current_waypoint_index"),
  
  // Geofencing
  geofenceEnabled: boolean("geofence_enabled").default(false),
  geofenceData: json("geofence_data"), // { type: 'circle' | 'polygon', center?, radius?, points?, maxAltitude?, minAltitude? }
  
  // Hardware configuration
  motorCount: integer("motor_count").default(4), // 4 or 6 motors
  hasGripper: boolean("has_gripper").default(false),
  hasCamera: boolean("has_camera").default(true),
  hasThermal: boolean("has_thermal").default(false),
  hasLidar: boolean("has_lidar").default(false),
  
  // Settings specific to this drone
  maxSpeed: real("max_speed").default(15), // m/s
  maxAltitude: real("max_altitude").default(120), // meters
  rtlAltitude: real("rtl_altitude").default(50), // meters
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSeen: timestamp("last_seen"),
});

export const insertDroneSchema = createInsertSchema(drones).omit({ id: true, createdAt: true, updatedAt: true, lastSeen: true });
export type InsertDrone = z.infer<typeof insertDroneSchema>;
export type Drone = typeof drones.$inferSelect;
