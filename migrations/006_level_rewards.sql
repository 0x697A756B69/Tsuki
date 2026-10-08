CREATE TABLE level_rewards (
  guild TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1),
  role TEXT NOT NULL,
  PRIMARY KEY (guild, level),
  UNIQUE (guild, role)
);