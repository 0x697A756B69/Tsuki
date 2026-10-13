ALTER TABLE automod_settings DROP COLUMN sensitivity;

ALTER TABLE automod_settings DROP COLUMN half_life_days;

ALTER TABLE automod_settings DROP COLUMN points_words;

ALTER TABLE automod_settings DROP COLUMN points_spam;

ALTER TABLE automod_settings DROP COLUMN points_mentions;

ALTER TABLE automod_logs DROP COLUMN points;

ALTER TABLE automod_logs DROP COLUMN trust;
