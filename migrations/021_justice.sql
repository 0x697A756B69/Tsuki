ALTER TABLE automod_settings ADD COLUMN justice_category TEXT;

ALTER TABLE automod_settings ADD COLUMN keep_transcript INTEGER NOT NULL DEFAULT 0
  CHECK (keep_transcript IN (0, 1));

ALTER TABLE automod_logs ADD COLUMN contest_channel TEXT;