ALTER TABLE automod_logs ADD COLUMN room_extra INTEGER NOT NULL DEFAULT 0;

ALTER TABLE automod_logs ADD COLUMN room_reminded INTEGER NOT NULL DEFAULT 0
  CHECK (room_reminded IN (0, 1));
