CREATE TABLE message_daily (
  guild TEXT NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  user TEXT NOT NULL,
  messages INTEGER NOT NULL CHECK (messages >= 0),
  PRIMARY KEY (guild, day, channel, user)
);