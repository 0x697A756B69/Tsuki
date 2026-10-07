ALTER TABLE guild_settings
  ADD COLUMN voice_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (voice_enabled IN (0, 1));
ALTER TABLE guild_settings
  ADD COLUMN voice_xp INTEGER NOT NULL DEFAULT 10
    CHECK (voice_xp >= 0);