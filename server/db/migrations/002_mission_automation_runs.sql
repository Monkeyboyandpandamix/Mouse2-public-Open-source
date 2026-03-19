-- Extend mission_runs to match MissionRunRecord
ALTER TABLE mission_runs ADD COLUMN connectionString TEXT;
ALTER TABLE mission_runs ADD COLUMN commandIds TEXT;
ALTER TABLE mission_runs ADD COLUMN expectedCompletionAt TEXT;
ALTER TABLE mission_runs ADD COLUMN completedAt TEXT;
ALTER TABLE mission_runs ADD COLUMN completionSource TEXT;
ALTER TABLE mission_runs ADD COLUMN waypointCount INTEGER;
ALTER TABLE mission_runs ADD COLUMN currentWaypointIndex INTEGER;
ALTER TABLE mission_runs ADD COLUMN progressUpdatedAt TEXT;

-- Extend automation_runs to match AutomationRunRecord
ALTER TABLE automation_runs ADD COLUMN scriptId TEXT;
ALTER TABLE automation_runs ADD COLUMN scriptName TEXT;
ALTER TABLE automation_runs ADD COLUMN trigger TEXT;
ALTER TABLE automation_runs ADD COLUMN reason TEXT;
ALTER TABLE automation_runs ADD COLUMN result TEXT;
ALTER TABLE automation_runs ADD COLUMN commandId TEXT;
ALTER TABLE automation_runs ADD COLUMN requestedBy TEXT;
ALTER TABLE automation_runs ADD COLUMN updatedAt TEXT;
