CREATE TABLE guild_settings (
  guild TEXT PRIMARY KEY,
  announce_mode TEXT NOT NULL DEFAULT 'current'
    CHECK (announce_mode IN ('channel', 'current', 'dm', 'off')),
  announce_channel TEXT,
  announce_message TEXT NOT NULL
    DEFAULT '{membre} est passé niveau {niveau}, félicitations !',
  xp_min INTEGER NOT NULL DEFAULT 10 CHECK (xp_min >= 0),
  xp_max INTEGER NOT NULL DEFAULT 20,
  cooldown INTEGER NOT NULL DEFAULT 60 CHECK (cooldown >= 0),
  CHECK (xp_max >= xp_min)
);