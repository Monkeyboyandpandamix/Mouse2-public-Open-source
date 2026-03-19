-- User-scoped terminal command presets (replaces localStorage)
CREATE TABLE IF NOT EXISTS terminal_command_presets (
  userId TEXT PRIMARY KEY,
  commands TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
