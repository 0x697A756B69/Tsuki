const COLUMNS = {
  logChannel: "log_channel",
  spamEnabled: "spam_enabled",
  mentionsEnabled: "mentions_enabled",
  mentionLimit: "mention_limit",
  observation: "observation",
  escalationWarns: "escalation_warns",
  escalationMinutes: "escalation_minutes",
};

function toSettings(row) {
  return {
    logChannel: row.log_channel === null ? null : String(row.log_channel),
    spamEnabled: Number(row.spam_enabled) === 1,
    mentionsEnabled: Number(row.mentions_enabled) === 1,
    mentionLimit: Number(row.mention_limit),
    observation: Number(row.observation) === 1,
    escalationWarns: Number(row.escalation_warns),
    escalationMinutes: Number(row.escalation_minutes),
    updatedBy: row.updated_by === null ? null : String(row.updated_by),
    updatedAt: row.updated_at === null ? null : Number(row.updated_at),
  };
}

function getAutomodSettings(db, guildId) {
  const select = db.prepare("SELECT * FROM automod_settings WHERE guild = ?");
  let row = select.get(guildId);
  if (!row) {
    db.prepare("INSERT INTO automod_settings (guild) VALUES (?)").run(guildId);
    row = select.get(guildId);
  }
  return toSettings(row);
}

function updateAutomodSettings(
  db,
  guildId,
  changes,
  authorId,
  date = Date.now(),
) {
  const entries = Object.entries(changes);
  for (const [key] of entries)
    if (!(key in COLUMNS)) throw new TypeError(`Unknown setting: ${key}`);

  getAutomodSettings(db, guildId);
  const assignments = [
    ...entries.map(([key]) => `${COLUMNS[key]} = ?`),
    "updated_by = ?",
    "updated_at = ?",
  ].join(", ");
  db.prepare(`UPDATE automod_settings SET ${assignments} WHERE guild = ?`).run(
    ...entries.map(([key, value]) =>
      typeof value === "boolean" ? Number(value) : value,
    ),
    authorId,
    date,
    guildId,
  );
  return getAutomodSettings(db, guildId);
}

module.exports = { getAutomodSettings, updateAutomodSettings };
