ALTER TABLE audio_sessions ADD COLUMN deviceType TEXT;
ALTER TABLE audio_sessions ADD COLUMN deviceId TEXT;
ALTER TABLE audio_sessions ADD COLUMN volume INTEGER;
ALTER TABLE audio_sessions ADD COLUMN live TEXT;
ALTER TABLE audio_sessions ADD COLUMN droneMic TEXT;
ALTER TABLE audio_sessions ADD COLUMN lastTtsAt TEXT;
ALTER TABLE audio_sessions ADD COLUMN lastBuzzerTone TEXT;
