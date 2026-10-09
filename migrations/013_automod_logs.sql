CREATE TABLE automod_logs (
  guild TEXT NOT NULL,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild, channel, message)
);

CREATE INDEX automod_logs_created_at ON automod_logs (created_at);