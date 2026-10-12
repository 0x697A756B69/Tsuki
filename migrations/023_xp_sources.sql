ALTER TABLE members ADD COLUMN message_xp INTEGER NOT NULL DEFAULT 0 CHECK (message_xp >= 0);
ALTER TABLE members ADD COLUMN voice_xp INTEGER NOT NULL DEFAULT 0 CHECK (voice_xp >= 0);
ALTER TABLE members ADD COLUMN manual_xp INTEGER NOT NULL DEFAULT 0;

UPDATE members SET message_xp = total_xp;

CREATE TABLE xp_daily_new (
  guild TEXT NOT NULL,
  user TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('messages', 'voice', 'manual')),
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild, user, day, source)
);

INSERT INTO xp_daily_new (guild, user, day, source, xp)
SELECT guild, user, day, 'messages', xp FROM xp_daily;

DROP TABLE xp_daily;
ALTER TABLE xp_daily_new RENAME TO xp_daily;

CREATE INDEX xp_daily_by_day ON xp_daily (guild, day);