ALTER TABLE automod_settings ADD COLUMN contest_hours INTEGER NOT NULL DEFAULT 168
  CHECK (contest_hours BETWEEN 0 AND 720);