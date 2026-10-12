ALTER TABLE raid_settings ADD COLUMN lockdown TEXT NOT NULL DEFAULT 'off' CHECK (lockdown IN ('off', 'invites', 'verification'));

CREATE TABLE raid_lockdowns (
  guild TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('invites', 'verification')),
  previous_level INTEGER,
  previous_invites_until INTEGER,
  started_at INTEGER NOT NULL
);
