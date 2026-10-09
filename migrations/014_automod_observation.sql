ALTER TABLE automod_settings ADD COLUMN observation INTEGER NOT NULL DEFAULT 0
  CHECK (observation IN (0, 1));