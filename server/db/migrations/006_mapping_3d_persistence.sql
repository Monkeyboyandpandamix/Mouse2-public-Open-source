-- Production 3D mapping: persistent sessions and models
CREATE TABLE IF NOT EXISTS mapping_3d_sessions (
  id TEXT PRIMARY KEY,
  active INTEGER DEFAULT 1,
  framesCaptured INTEGER DEFAULT 0,
  coveragePercent REAL DEFAULT 0,
  confidence REAL DEFAULT 0,
  trackX REAL DEFAULT 0,
  trackY REAL DEFAULT 0,
  distanceEstimate REAL DEFAULT 0,
  coverageBins TEXT,
  trajectory TEXT,
  lastFrameAt TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mapping_3d_models (
  id TEXT PRIMARY KEY,
  jsonPath TEXT NOT NULL,
  plyPath TEXT,
  framesCaptured INTEGER NOT NULL,
  coveragePercent REAL NOT NULL,
  confidence REAL NOT NULL,
  estimatedDistance REAL,
  generatedAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mapping_3d_models_created ON mapping_3d_models(createdAt DESC);
