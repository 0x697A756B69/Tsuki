ALTER TABLE automod_logs ADD COLUMN user_id TEXT;

ALTER TABLE automod_logs ADD COLUMN contested_at INTEGER;

ALTER TABLE automod_logs ADD COLUMN contest_status TEXT
  CHECK (contest_status IN ('pending', 'accepted', 'refused'));

ALTER TABLE automod_logs ADD COLUMN timeout_until INTEGER;