CREATE TABLE automod_settings (
  guild TEXT PRIMARY KEY,
  log_channel TEXT,
  mention_limit INTEGER NOT NULL DEFAULT 5
    CHECK (mention_limit BETWEEN 1 AND 50),
  escalation_warns INTEGER NOT NULL DEFAULT 3
    CHECK (escalation_warns >= 0),
  escalation_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (escalation_minutes BETWEEN 1 AND 40320),
  updated_by TEXT,
  updated_at INTEGER
);