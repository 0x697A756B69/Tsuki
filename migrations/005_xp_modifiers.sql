CREATE TABLE xp_modifiers (
  guild TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('role', 'channel')),
  target TEXT NOT NULL,
  multiplier REAL NOT NULL CHECK (multiplier >= 0 AND multiplier <= 2),
  PRIMARY KEY (guild, type, target)
);