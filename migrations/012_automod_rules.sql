ALTER TABLE automod_settings ADD COLUMN spam_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (spam_enabled IN (0, 1));
ALTER TABLE automod_settings ADD COLUMN mentions_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (mentions_enabled IN (0, 1));

CREATE TABLE automod_words (
  guild TEXT NOT NULL,
  word TEXT NOT NULL,
  PRIMARY KEY (guild, word)
);

CREATE TABLE automod_exemptions (
  guild TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('role', 'channel')),
  target TEXT NOT NULL,
  PRIMARY KEY (guild, kind, target)
);