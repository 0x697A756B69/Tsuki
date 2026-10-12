CREATE TABLE raid_settings (
  guild TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0
    CHECK (enabled IN (0, 1)),
  observation INTEGER NOT NULL DEFAULT 0
    CHECK (observation IN (0, 1)),
  scope TEXT NOT NULL DEFAULT 'suspect'
    CHECK (scope IN ('all', 'suspect')),
  window_minutes INTEGER NOT NULL DEFAULT 10
    CHECK (window_minutes BETWEEN 1 AND 60),
  calm_minutes INTEGER NOT NULL DEFAULT 10
    CHECK (calm_minutes BETWEEN 1 AND 1440),
  watch_joins INTEGER NOT NULL DEFAULT 5
    CHECK (watch_joins BETWEEN 2 AND 200),
  alert_joins INTEGER NOT NULL DEFAULT 8
    CHECK (alert_joins BETWEEN 2 AND 200),
  raid_joins INTEGER NOT NULL DEFAULT 10
    CHECK (raid_joins BETWEEN 2 AND 200),
  account_days INTEGER NOT NULL DEFAULT 7
    CHECK (account_days BETWEEN 1 AND 365),
  signal_age INTEGER NOT NULL DEFAULT 1
    CHECK (signal_age IN (0, 1)),
  signal_avatar INTEGER NOT NULL DEFAULT 1
    CHECK (signal_avatar IN (0, 1)),
  signal_names INTEGER NOT NULL DEFAULT 1
    CHECK (signal_names IN (0, 1)),
  signal_burst INTEGER NOT NULL DEFAULT 1
    CHECK (signal_burst IN (0, 1)),
  signal_invite INTEGER NOT NULL DEFAULT 1
    CHECK (signal_invite IN (0, 1)),
  watch_action TEXT NOT NULL DEFAULT 'log'
    CHECK (watch_action IN ('log', 'timeout', 'kick', 'ban', 'quarantine')),
  alert_action TEXT NOT NULL DEFAULT 'log'
    CHECK (alert_action IN ('log', 'timeout', 'kick', 'ban', 'quarantine')),
  raid_action TEXT NOT NULL DEFAULT 'log'
    CHECK (raid_action IN ('log', 'timeout', 'kick', 'ban', 'quarantine')),
  timeout_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (timeout_minutes BETWEEN 1 AND 40320),
  quarantine_role TEXT,
  updated_by TEXT,
  updated_at INTEGER,
  CHECK (watch_joins <= alert_joins AND alert_joins <= raid_joins)
);

CREATE TABLE raid_joins (
  guild TEXT NOT NULL,
  user TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  signals TEXT NOT NULL DEFAULT '',
  invite TEXT,
  PRIMARY KEY (guild, user, joined_at)
);

CREATE INDEX raid_joins_by_date ON raid_joins (guild, joined_at);

CREATE TABLE raid_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('calm', 'watch', 'alert', 'raid')),
  joins INTEGER NOT NULL CHECK (joins >= 0),
  observed INTEGER NOT NULL DEFAULT 0 CHECK (observed IN (0, 1)),
  at INTEGER NOT NULL
);

CREATE INDEX raid_tiers_by_date ON raid_tiers (guild, at);