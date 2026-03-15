import { z } from "zod";

// System Settings
export const settingsSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.any(),
  category: z.string(),
  updatedAt: z.string(),
});

export const insertSettingsSchema = settingsSchema.omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

// Flight Missions
export const missionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.string().default("planned"),
  homeLatitude: z.number(),
  homeLongitude: z.number(),
  homeAltitude: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertMissionSchema = missionSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type Mission = z.infer<typeof missionSchema>;

// Mission Waypoints
export const waypointSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  order: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number(),
  speed: z.number().nullable().optional(),
  action: z.string().nullable().optional(),
  actionParams: z.any().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const insertWaypointSchema = waypointSchema.omit({ id: true });
export type InsertWaypoint = z.infer<typeof insertWaypointSchema>;
export type Waypoint = z.infer<typeof waypointSchema>;

// Flight Sessions
export const flightSessionSchema = z.object({
  id: z.string(),
  droneId: z.string().nullable().optional(),
  missionId: z.string().nullable().optional(),
  startTime: z.string(),
  endTime: z.string().nullable().optional(),
  status: z.string().default("active"),
  totalFlightTime: z.number().nullable().optional(),
  maxAltitude: z.number().nullable().optional(),
  totalDistance: z.number().nullable().optional(),
  videoFilePath: z.string().nullable().optional(),
  logFilePath: z.string().nullable().optional(),
  model3dFilePath: z.string().nullable().optional(),
  category: z.enum(['training', 'survey', 'inspection', 'emergency', 'delivery', 'monitoring', 'other']).nullable().optional(),
  missionName: z.string().nullable().optional(),
  pilotName: z.string().nullable().optional(),
  pilotId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  weatherConditions: z.string().nullable().optional(),
  windSpeedAvg: z.number().nullable().optional(),
  temperatureC: z.number().nullable().optional(),
  rating: z.number().min(1).max(5).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  takeoffLocation: z.string().nullable().optional(),
  landingLocation: z.string().nullable().optional(),
  batteryStartPercent: z.number().nullable().optional(),
  batteryEndPercent: z.number().nullable().optional(),
  waypointsCompleted: z.number().nullable().optional(),
  waypointsTotal: z.number().nullable().optional(),
  incidentReport: z.string().nullable().optional(),
});

export const insertFlightSessionSchema = flightSessionSchema.omit({ id: true });
export type InsertFlightSession = z.infer<typeof insertFlightSessionSchema>;
export type FlightSession = z.infer<typeof flightSessionSchema>;

export const FLIGHT_CATEGORIES = [
  { value: 'training', label: 'Training', color: 'bg-blue-500' },
  { value: 'survey', label: 'Survey/Mapping', color: 'bg-green-500' },
  { value: 'inspection', label: 'Inspection', color: 'bg-orange-500' },
  { value: 'emergency', label: 'Emergency Response', color: 'bg-red-500' },
  { value: 'delivery', label: 'Delivery', color: 'bg-purple-500' },
  { value: 'monitoring', label: 'Monitoring', color: 'bg-cyan-500' },
  { value: 'other', label: 'Other', color: 'bg-gray-500' },
] as const;

// Flight Events
export const flightEventSchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable().optional(),
  timestamp: z.string(),
  eventType: z.string(),
  eventData: z.any(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  altitude: z.number().nullable().optional(),
});

export const insertFlightEventSchema = flightEventSchema.omit({ id: true, timestamp: true });
export type InsertFlightEvent = z.infer<typeof insertFlightEventSchema>;
export type FlightEvent = z.infer<typeof flightEventSchema>;

// Flight Logs (Telemetry History)
export const flightLogSchema = z.object({
  id: z.string(),
  sessionId: z.string().nullable().optional(),
  missionId: z.string().nullable().optional(),
  droneId: z.string().nullable().optional(),
  timestamp: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  altitude: z.number().nullable().optional(),
  relativeAltitude: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  groundSpeed: z.number().nullable().optional(),
  verticalSpeed: z.number().nullable().optional(),
  airSpeed: z.number().nullable().optional(),
  batteryVoltage: z.number().nullable().optional(),
  batteryCurrent: z.number().nullable().optional(),
  batteryPercent: z.number().nullable().optional(),
  batteryTemp: z.number().nullable().optional(),
  gpsFixType: z.number().nullable().optional(),
  gpsSatellites: z.number().nullable().optional(),
  gpsHdop: z.number().nullable().optional(),
  flightMode: z.string().nullable().optional(),
  armed: z.boolean().default(false),
  pitch: z.number().nullable().optional(),
  roll: z.number().nullable().optional(),
  yaw: z.number().nullable().optional(),
  motor1Rpm: z.number().nullable().optional(),
  motor2Rpm: z.number().nullable().optional(),
  motor3Rpm: z.number().nullable().optional(),
  motor4Rpm: z.number().nullable().optional(),
  motor1Current: z.number().nullable().optional(),
  motor2Current: z.number().nullable().optional(),
  motor3Current: z.number().nullable().optional(),
  motor4Current: z.number().nullable().optional(),
  cpuTemp: z.number().nullable().optional(),
  vibrationX: z.number().nullable().optional(),
  vibrationY: z.number().nullable().optional(),
  vibrationZ: z.number().nullable().optional(),
  distanceFromHome: z.number().nullable().optional(),
  windSpeed: z.number().nullable().optional(),
  windDirection: z.number().nullable().optional(),
});

export const insertFlightLogSchema = flightLogSchema.omit({ id: true, timestamp: true });
export type InsertFlightLog = z.infer<typeof insertFlightLogSchema>;
export type FlightLog = z.infer<typeof flightLogSchema>;

// Sensor Data
export const sensorDataSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  sensorType: z.string(),
  sensorId: z.string(),
  data: z.any(),
});

export const insertSensorDataSchema = sensorDataSchema.omit({ id: true, timestamp: true });
export type InsertSensorData = z.infer<typeof insertSensorDataSchema>;
export type SensorData = z.infer<typeof sensorDataSchema>;

// Motor/ESC Telemetry
export const motorTelemetrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  motor1Rpm: z.number().nullable().optional(),
  motor2Rpm: z.number().nullable().optional(),
  motor3Rpm: z.number().nullable().optional(),
  motor4Rpm: z.number().nullable().optional(),
  motor1Temp: z.number().nullable().optional(),
  motor2Temp: z.number().nullable().optional(),
  motor3Temp: z.number().nullable().optional(),
  motor4Temp: z.number().nullable().optional(),
  motor1Current: z.number().nullable().optional(),
  motor2Current: z.number().nullable().optional(),
  motor3Current: z.number().nullable().optional(),
  motor4Current: z.number().nullable().optional(),
  escTemp: z.number().nullable().optional(),
  cpuTemp: z.number().nullable().optional(),
  vibrationX: z.number().nullable().optional(),
  vibrationY: z.number().nullable().optional(),
  vibrationZ: z.number().nullable().optional(),
});

export const insertMotorTelemetrySchema = motorTelemetrySchema.omit({ id: true, timestamp: true });
export type InsertMotorTelemetry = z.infer<typeof insertMotorTelemetrySchema>;
export type MotorTelemetry = z.infer<typeof motorTelemetrySchema>;

// Camera/Tracking Settings
export const cameraSettingsSchema = z.object({
  id: z.string(),
  activeCamera: z.string().default("gimbal"),
  trackingEnabled: z.boolean().default(false),
  trackingTarget: z.string().nullable().optional(),
  trackingConfidence: z.number().nullable().optional(),
  gimbalPitch: z.number().nullable().optional(),
  gimbalYaw: z.number().nullable().optional(),
  recordingEnabled: z.boolean().default(false),
  updatedAt: z.string(),
});

export const insertCameraSettingsSchema = cameraSettingsSchema.omit({ id: true, updatedAt: true });
export type InsertCameraSettings = z.infer<typeof insertCameraSettingsSchema>;
export type CameraSettings = z.infer<typeof cameraSettingsSchema>;

// Connected Drones
export const droneSchema = z.object({
  id: z.string(),
  name: z.string(),
  callsign: z.string(),
  model: z.string().default("Custom"),
  status: z.string().default("offline"),
  connectionType: z.string().default("mavlink"),
  connectionString: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  altitude: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  batteryPercent: z.number().nullable().optional(),
  signalStrength: z.number().nullable().optional(),
  gpsStatus: z.string().default("no_fix"),
  currentMissionId: z.string().nullable().optional(),
  currentWaypointIndex: z.number().nullable().optional(),
  geofenceEnabled: z.boolean().default(false),
  geofenceData: z.any().nullable().optional(),
  motorCount: z.number().default(4),
  hasGripper: z.boolean().default(false),
  hasCamera: z.boolean().default(true),
  hasThermal: z.boolean().default(false),
  hasLidar: z.boolean().default(false),
  maxSpeed: z.number().default(15),
  maxAltitude: z.number().default(120),
  rtlAltitude: z.number().default(50),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeen: z.string().nullable().optional(),
});

export const insertDroneSchema = droneSchema.omit({ id: true, createdAt: true, updatedAt: true, lastSeen: true });
export type InsertDrone = z.infer<typeof insertDroneSchema>;
export type Drone = z.infer<typeof droneSchema>;

// Media Assets
export const mediaAssetSchema = z.object({
  id: z.string(),
  droneId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  type: z.string(),
  filename: z.string(),
  storagePath: z.string().nullable().optional(),
  driveFileId: z.string().nullable().optional(),
  driveLink: z.string().nullable().optional(),
  mimeType: z.string(),
  fileSize: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  altitude: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  cameraMode: z.string().nullable().optional(),
  zoomLevel: z.number().nullable().optional(),
  syncStatus: z.string().default("synced"),
  syncError: z.string().nullable().optional(),
  capturedAt: z.string(),
  createdAt: z.string(),
});

export const insertMediaAssetSchema = mediaAssetSchema.omit({ id: true, createdAt: true });
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

// Offline Data Backlog
export const offlineBacklogSchema = z.object({
  id: z.string(),
  clientRequestId: z.string().uuid().optional(),
  droneId: z.string().nullable().optional(),
  dataType: z.string(),
  data: z.any(),
  priority: z.number().default(1),
  localFilePath: z.string().nullable().optional(),
  fileChecksum: z.string().nullable().optional(),
  syncStatus: z.string().default("pending"),
  syncAttempts: z.number().default(0),
  lastSyncAttempt: z.string().nullable().optional(),
  syncError: z.string().nullable().optional(),
  recordedAt: z.string(),
  queuedAt: z.string(),
  syncedAt: z.string().nullable().optional(),
});

export const insertOfflineBacklogSchema = offlineBacklogSchema.omit({ id: true, queuedAt: true, syncedAt: true });
export type InsertOfflineBacklog = z.infer<typeof insertOfflineBacklogSchema>;
export type OfflineBacklog = z.infer<typeof offlineBacklogSchema>;

// Message Recipient (for multi-recipient DMs)
export const messageRecipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['user', 'group']), // 'user' for individual, 'group' for group
});
export type MessageRecipient = z.infer<typeof messageRecipientSchema>;

// User Messages (Team Communication)
export const userMessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  senderRole: z.string(),
  recipientId: z.string().nullable().optional(), // Legacy: single recipient (null = broadcast)
  recipientName: z.string().nullable().optional(), // Legacy: single recipient name
  recipients: z.array(messageRecipientSchema).nullable().optional(), // New: multi-recipient support
  content: z.string(),
  originalContent: z.string().nullable().optional(), // Preserved original before edit
  timestamp: z.string(),
  editedAt: z.string().nullable().optional(),
  deleted: z.boolean().default(false),
  deletedAt: z.string().nullable().optional(), // When deleted
  deletedBy: z.string().nullable().optional(), // Who deleted it
});

export const insertUserMessageSchema = userMessageSchema.omit({ id: true, timestamp: true, editedAt: true, deleted: true });
export type InsertUserMessage = z.infer<typeof insertUserMessageSchema>;
export type UserMessage = z.infer<typeof userMessageSchema>;

// User Group (for group messaging)
export const userGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  memberIds: z.array(z.string()), // Array of user IDs
  defaultRole: z.string().optional(), // Default role for group members (admin, operator, viewer, or custom)
  createdAt: z.string(),
  createdBy: z.string(),
});
export type UserGroup = z.infer<typeof userGroupSchema>;

// Chat User (extracted from messages for autocomplete)
export const chatUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.string(),
});
export type ChatUser = z.infer<typeof chatUserSchema>;

// BME688 Environmental Sensor Readings
export const bme688ReadingSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  tempC: z.number(),
  tempF: z.number(),
  humidity: z.number(),
  pressure: z.number(),
  gasOhms: z.number(),
  altitude: z.number(),
  iaqScore: z.number(),
  vocPpm: z.number(),
  vscPpb: z.number(),
  co2Ppm: z.number(),
  h2Ppm: z.number(),
  coPpm: z.number(),
  ethanolPpm: z.number(),
  healthRisk: z.enum(['GOOD', 'MODERATE', 'HIGH', 'CRITICAL']),
  healthRiskDesc: z.string(),
  droneId: z.string().nullable().optional(),
});

export const insertBme688ReadingSchema = bme688ReadingSchema.omit({ id: true });
export type InsertBme688Reading = z.infer<typeof insertBme688ReadingSchema>;
export type Bme688Reading = z.infer<typeof bme688ReadingSchema>;

// BME688 Health Risk Thresholds
export const BME688_THRESHOLDS = {
  VOC_MODERATE: 2.0,
  VOC_HIGH: 5.0,
  CO_LOW: 3,
  CO_HIGH: 9,
  CO_CRITICAL: 50,
  CO2_ELEVATED: 1000,
  CO2_HIGH: 2000,
  H2_WARNING: 10,
  VSC_STRONG: 100,
  IAQ_GOOD: 100,
  IAQ_MODERATE: 200,
  IAQ_POOR: 300,
} as const;
