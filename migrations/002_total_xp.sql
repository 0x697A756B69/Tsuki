CREATE TABLE members (
  guild TEXT NOT NULL,
  user TEXT NOT NULL,
  total_xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild, user)
);

CREATE INDEX members_by_xp ON members (guild, total_xp DESC);

CREATE TABLE xp_daily (
  guild TEXT NOT NULL,
  user TEXT NOT NULL,
  day TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild, user, day)
);

CREATE INDEX xp_daily_by_day ON xp_daily (guild, day);

INSERT INTO members (guild, user, total_xp)
SELECT guild, user, 500 * level * (level + 1) + xp FROM xp;

DROP TABLE xp;