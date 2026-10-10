CREATE TABLE warn_reasons (
  guild TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 50),
  PRIMARY KEY (guild, position),
  UNIQUE (guild, label)
);

ALTER TABLE automod_settings ADD COLUMN reason_words TEXT NOT NULL DEFAULT 'Insultes'
  CHECK (length(reason_words) BETWEEN 1 AND 50);

ALTER TABLE automod_settings ADD COLUMN reason_spam TEXT NOT NULL DEFAULT 'Spam'
  CHECK (length(reason_spam) BETWEEN 1 AND 50);

ALTER TABLE automod_settings ADD COLUMN reason_mentions TEXT NOT NULL DEFAULT 'Mentions de masse'
  CHECK (length(reason_mentions) BETWEEN 1 AND 50);