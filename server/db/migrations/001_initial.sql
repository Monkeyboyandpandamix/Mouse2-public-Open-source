-- Core entities (from FileStorage)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT,
  category TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planned',
  homeLatitude REAL NOT NULL,
  homeLongitude REAL NOT NULL,
  homeAltitude REAL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waypoints (
  id TEXT PRIMARY KEY,
  missionId TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  altitude REAL NOT NULL,
  speed REAL,
  action TEXT,
  actionParams TEXT,
  address TEXT,
  FOREIGN KEY (missionId) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flight_sessions (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  missionId TEXT,
  startTime TEXT NOT NULL,
  endTime TEXT,
  status TEXT DEFAULT 'active',
  totalFlightTime REAL,
  maxAltitude REAL,
  totalDistance REAL,
  videoFilePath TEXT,
  logFilePath TEXT,
  model3dFilePath TEXT,
  category TEXT,
  missionName TEXT,
  pilotName TEXT,
  pilotId TEXT,
  notes TEXT,
  weatherConditions TEXT,
  windSpeedAvg REAL,
  temperatureC REAL,
  rating INTEGER,
  tags TEXT,
  takeoffLocation TEXT,
  landingLocation TEXT,
  batteryStartPercent REAL,
  batteryEndPercent REAL,
  waypointsCompleted INTEGER,
  waypointsTotal INTEGER,
  incidentReport TEXT
);

CREATE TABLE IF NOT EXISTS flight_logs (
  id TEXT PRIMARY KEY,
  sessionId TEXT,
  missionId TEXT,
  droneId TEXT,
  timestamp TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  altitude REAL,
  relativeAltitude REAL,
  heading REAL,
  groundSpeed REAL,
  verticalSpeed REAL,
  airSpeed REAL,
  batteryVoltage REAL,
  batteryCurrent REAL,
  batteryPercent REAL,
  batteryTemp REAL,
  gpsFixType INTEGER,
  gpsSatellites INTEGER,
  gpsHdop REAL,
  flightMode TEXT,
  armed INTEGER DEFAULT 0,
  pitch REAL,
  roll REAL,
  yaw REAL,
  motor1Rpm REAL,
  motor2Rpm REAL,
  motor3Rpm REAL,
  motor4Rpm REAL,
  motor1Current REAL,
  motor2Current REAL,
  motor3Current REAL,
  motor4Current REAL,
  cpuTemp REAL,
  vibrationX REAL,
  vibrationY REAL,
  vibrationZ REAL,
  distanceFromHome REAL,
  windSpeed REAL,
  windDirection REAL
);

CREATE TABLE IF NOT EXISTS sensor_data (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  sensorType TEXT NOT NULL,
  sensorId TEXT NOT NULL,
  data TEXT
);

CREATE TABLE IF NOT EXISTS motor_telemetry (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  motor1Rpm REAL,
  motor2Rpm REAL,
  motor3Rpm REAL,
  motor4Rpm REAL,
  motor1Temp REAL,
  motor2Temp REAL,
  motor3Temp REAL,
  motor4Temp REAL,
  motor1Current REAL,
  motor2Current REAL,
  motor3Current REAL,
  motor4Current REAL,
  escTemp REAL,
  cpuTemp REAL,
  vibrationX REAL,
  vibrationY REAL,
  vibrationZ REAL
);

CREATE TABLE IF NOT EXISTS camera_settings (
  id TEXT PRIMARY KEY,
  activeCamera TEXT DEFAULT 'gimbal',
  trackingEnabled INTEGER DEFAULT 0,
  trackingTarget TEXT,
  trackingConfidence REAL,
  gimbalPitch REAL,
  gimbalYaw REAL,
  model TEXT,
  resolution TEXT,
  thermalResolution TEXT,
  lens TEXT,
  streamUrl TEXT,
  streamEnabled INTEGER,
  recordingEnabled INTEGER DEFAULT 0,
  droneId TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  callsign TEXT NOT NULL,
  model TEXT DEFAULT 'Custom',
  status TEXT DEFAULT 'offline',
  connectionType TEXT DEFAULT 'mavlink',
  connectionString TEXT,
  latitude REAL,
  longitude REAL,
  altitude REAL,
  heading REAL,
  batteryPercent REAL,
  signalStrength REAL,
  gpsStatus TEXT DEFAULT 'no_fix',
  currentMissionId TEXT,
  currentWaypointIndex INTEGER,
  geofenceEnabled INTEGER DEFAULT 0,
  geofenceData TEXT,
  motorCount INTEGER DEFAULT 4,
  hasGripper INTEGER DEFAULT 0,
  hasCamera INTEGER DEFAULT 1,
  hasThermal INTEGER DEFAULT 0,
  hasLidar INTEGER DEFAULT 0,
  maxSpeed REAL DEFAULT 15,
  maxAltitude REAL DEFAULT 120,
  rtlAltitude REAL DEFAULT 50,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  lastSeen TEXT
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  sessionId TEXT,
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  storagePath TEXT,
  driveFileId TEXT,
  driveLink TEXT,
  mimeType TEXT NOT NULL,
  fileSize INTEGER,
  duration REAL,
  latitude REAL,
  longitude REAL,
  altitude REAL,
  heading REAL,
  cameraMode TEXT,
  zoomLevel REAL,
  syncStatus TEXT DEFAULT 'synced',
  syncError TEXT,
  capturedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offline_backlog (
  id TEXT PRIMARY KEY,
  clientRequestId TEXT,
  droneId TEXT,
  dataType TEXT NOT NULL,
  data TEXT,
  priority INTEGER DEFAULT 1,
  localFilePath TEXT,
  fileChecksum TEXT,
  syncStatus TEXT DEFAULT 'pending',
  syncAttempts INTEGER DEFAULT 0,
  lastSyncAttempt TEXT,
  syncError TEXT,
  recordedAt TEXT NOT NULL,
  queuedAt TEXT NOT NULL,
  syncedAt TEXT,
  receiptId TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  senderId TEXT NOT NULL,
  senderName TEXT NOT NULL,
  senderRole TEXT NOT NULL,
  recipientId TEXT,
  recipientName TEXT,
  recipients TEXT,
  content TEXT NOT NULL,
  originalContent TEXT,
  timestamp TEXT NOT NULL,
  editedAt TEXT,
  deleted INTEGER DEFAULT 0,
  deletedAt TEXT,
  deletedBy TEXT
);

-- Runtime state tables (from plan)
CREATE TABLE IF NOT EXISTS mission_runs (
  id TEXT PRIMARY KEY,
  missionId TEXT NOT NULL,
  droneId TEXT,
  status TEXT NOT NULL,
  progress REAL DEFAULT 0,
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  recipeId TEXT,
  status TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  error TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_recipes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  code TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_preferences (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  selectedDroneId TEXT,
  cameraSettings TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(userId)
);

CREATE TABLE IF NOT EXISTS firmware_jobs (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  status TEXT NOT NULL,
  progress REAL DEFAULT 0,
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audio_sessions (
  id TEXT PRIMARY KEY,
  outputDevice TEXT,
  liveEnabled INTEGER DEFAULT 0,
  droneMicEnabled INTEGER DEFAULT 0,
  ttsEnabled INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mapping_jobs (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  status TEXT NOT NULL,
  progress REAL DEFAULT 0,
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rtk_state (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  state TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gps_inject_state (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  state TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS serial_passthrough_state (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  state TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calibration_state (
  id TEXT PRIMARY KEY,
  droneId TEXT,
  state TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fc_applied_state (
  droneId TEXT PRIMARY KEY,
  missionHash TEXT,
  fenceHash TEXT,
  profileHash TEXT,
  appliedAt TEXT NOT NULL,
  appliedBy TEXT
);

CREATE INDEX IF NOT EXISTS idx_waypoints_mission ON waypoints(missionId);
CREATE INDEX IF NOT EXISTS idx_flight_logs_mission ON flight_logs(missionId);
CREATE INDEX IF NOT EXISTS idx_flight_logs_session ON flight_logs(sessionId);
CREATE INDEX IF NOT EXISTS idx_flight_logs_timestamp ON flight_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_data_type ON sensor_data(sensorType);
CREATE INDEX IF NOT EXISTS idx_motor_telemetry_timestamp ON motor_telemetry(timestamp);
CREATE INDEX IF NOT EXISTS idx_camera_settings_drone ON camera_settings(droneId);
CREATE INDEX IF NOT EXISTS idx_media_assets_drone ON media_assets(droneId);
CREATE INDEX IF NOT EXISTS idx_media_assets_session ON media_assets(sessionId);
CREATE INDEX IF NOT EXISTS idx_offline_backlog_status ON offline_backlog(syncStatus);
CREATE INDEX IF NOT EXISTS idx_offline_backlog_drone ON offline_backlog(droneId);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_automation_recipes_user ON automation_recipes(userId);
CREATE INDEX IF NOT EXISTS idx_operator_preferences_user ON operator_preferences(userId);
