ALTER TABLE automod_settings ADD COLUMN mute_type TEXT NOT NULL DEFAULT 'timeout'
  CHECK (mute_type IN ('timeout', 'role'));

ALTER TABLE automod_settings ADD COLUMN mute_role TEXT;