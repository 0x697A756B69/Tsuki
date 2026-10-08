CREATE TABLE voice_daily (
  guild TEXT NOT NULL,
  day TEXT NOT NULL,
  user TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  PRIMARY KEY (guild, day, user)
);