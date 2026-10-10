ALTER TABLE automod_settings ADD COLUMN sensitivity INTEGER NOT NULL DEFAULT 6
  CHECK (sensitivity BETWEEN 0 AND 100);

ALTER TABLE automod_settings ADD COLUMN half_life_days INTEGER NOT NULL DEFAULT 3
  CHECK (half_life_days BETWEEN 1 AND 30);

ALTER TABLE automod_settings ADD COLUMN points_words INTEGER NOT NULL DEFAULT 2
  CHECK (points_words BETWEEN 1 AND 20);

ALTER TABLE automod_settings ADD COLUMN points_spam INTEGER NOT NULL DEFAULT 1
  CHECK (points_spam BETWEEN 1 AND 20);

ALTER TABLE automod_settings ADD COLUMN points_mentions INTEGER NOT NULL DEFAULT 3
  CHECK (points_mentions BETWEEN 1 AND 20);

UPDATE automod_settings SET sensitivity = CASE
  WHEN escalation_warns = 0 THEN 0
  WHEN escalation_warns <= 2 THEN 3
  WHEN escalation_warns <= 4 THEN 6
  ELSE 10
END;