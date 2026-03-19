-- Add description and lastRun to automation_recipes for UI parity
ALTER TABLE automation_recipes ADD COLUMN description TEXT;
ALTER TABLE automation_recipes ADD COLUMN lastRun TEXT;
