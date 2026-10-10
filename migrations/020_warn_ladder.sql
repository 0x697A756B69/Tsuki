CREATE TABLE warn_ladder (
  guild TEXT NOT NULL,
  warns INTEGER NOT NULL CHECK (warns >= 1),
  sanction TEXT CHECK (sanction IN ('timeout', 'kick', 'ban')),
  minutes INTEGER CHECK (minutes BETWEEN 1 AND 40320),
  PRIMARY KEY (guild, warns),
  CHECK ((sanction = 'timeout') = (minutes IS NOT NULL))
);

ALTER TABLE automod_settings ADD COLUMN warn_valid_days INTEGER NOT NULL DEFAULT 30
  CHECK (warn_valid_days BETWEEN 0 AND 365);

ALTER TABLE warns ADD COLUMN sanction TEXT
  CHECK (sanction IN ('timeout', 'kick', 'ban'));

ALTER TABLE warns ADD COLUMN timeout_until INTEGER;