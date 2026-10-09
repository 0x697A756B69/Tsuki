ALTER TABLE automod_logs ADD COLUMN points INTEGER
  CHECK (points BETWEEN 1 AND 20);

ALTER TABLE automod_logs ADD COLUMN trust REAL
  CHECK (trust > 0);