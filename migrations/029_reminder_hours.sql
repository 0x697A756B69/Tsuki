ALTER TABLE automod_settings ADD COLUMN reminder_hours INTEGER NOT NULL DEFAULT 1
  CHECK (reminder_hours BETWEEN 0 AND 12);
