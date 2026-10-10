const COLUMNS = {
  logChannel: "log_channel",
  spamEnabled: "spam_enabled",
  mentionsEnabled: "mentions_enabled",
  mentionLimit: "mention_limit",
  observation: "observation",
  contestHours: "contest_hours",
  escalationMinutes: "escalation_minutes",
  sensitivity: "sensitivity",
  halfLifeDays: "half_life_days",
  pointsWords: "points_words",
  pointsSpam: "points_spam",
  pointsMentions: "points_mentions",
  reasonWords: "reason_words",
  reasonSpam: "reason_spam",
  reasonMentions: "reason_mentions",
  warnValidDays: "warn_valid_days",
  justiceCategory: "justice_category",
  keepTranscript: "keep_transcript",
};

function toSettings(row) {
  return {
    logChannel: row.log_channel === null ? null : String(row.log_channel),
    spamEnabled: Number(row.spam_enabled) === 1,
    mentionsEnabled: Number(row.mentions_enabled) === 1,
    mentionLimit: Number(row.mention_limit),
    observation: Number(row.observation) === 1,
    contestHours: Number(row.contest_hours),
    escalationMinutes: Number(row.escalation_minutes),
    sensitivity: Number(row.sensitivity),
    halfLifeDays: Number(row.half_life_days),
    pointsWords: Number(row.points_words),
    pointsSpam: Number(row.points_spam),
    pointsMentions: Number(row.points_mentions),
    reasonWords: String(row.reason_words),
    reasonSpam: String(row.reason_spam),
    reasonMentions: String(row.reason_mentions),
    warnValidDays: Number(row.warn_valid_days),
    justiceCategory:
      row.justice_category === null ? null : String(row.justice_category),
    keepTranscript: Number(row.keep_transcript) === 1,
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
