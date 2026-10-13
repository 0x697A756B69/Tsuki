const { RETENTION, buildLogMessage } = require("./automodLogView");

const PURGE_BATCH = 100;

function addLog(
  db,
  { guildId, channelId, messageId, userId = null, date = Date.now() },
) {
  db.prepare(
    "INSERT INTO automod_logs (guild, channel, message, created_at, user_id) VALUES (?, ?, ?, ?, ?)",
  ).run(guildId, channelId, messageId, date, userId);
}

function getLog(db, { guildId, channelId, messageId }) {
  const row = db
    .prepare(
      "SELECT * FROM automod_logs WHERE guild = ? AND channel = ? AND message = ?",
    )
    .get(guildId, channelId, messageId);
  if (!row) return null;
  return {
    userId: row.user_id === null ? null : String(row.user_id),
    createdAt: Number(row.created_at),
    contestedAt: row.contested_at === null ? null : Number(row.contested_at),
    contestStatus:
      row.contest_status === null ? null : String(row.contest_status),
    contestChannel:
      row.contest_channel === null ? null : String(row.contest_channel),
    judgedBy: row.judged_by === null ? null : String(row.judged_by),
    judgedAt: row.judged_at === null ? null : Number(row.judged_at),
  };
}

function getLogByContestChannel(db, guildId, contestChannelId) {
  const row = db
    .prepare(
      "SELECT channel, message FROM automod_logs WHERE guild = ? AND contest_channel = ?",
    )
    .get(guildId, contestChannelId);
  if (!row) return null;
  const ref = {
    guildId,
    channelId: String(row.channel),
    messageId: String(row.message),
  };
  return { ref, ...getLog(db, ref) };
}

function isContestChannel(db, guildId, channelId) {
  return (
    db
      .prepare(
        "SELECT 1 FROM automod_logs WHERE guild = ? AND contest_channel = ?",
      )
      .get(guildId, channelId) !== undefined
  );
}

function setJudged(
  db,
  { guildId, channelId, messageId },
  moderatorId,
  date = Date.now(),
) {
  const result = db
    .prepare(
      "UPDATE automod_logs SET judged_by = ?, judged_at = ? WHERE guild = ? AND channel = ? AND message = ? AND judged_at IS NULL",
    )
    .run(moderatorId, date, guildId, channelId, messageId);
  return Number(result.changes) > 0;
}

function clearContestChannel(db, { guildId, channelId, messageId }) {
  db.prepare(
    "UPDATE automod_logs SET contest_channel = NULL WHERE guild = ? AND channel = ? AND message = ?",
  ).run(guildId, channelId, messageId);
}

function setContestStatus(db, { guildId, channelId, messageId }, status) {
  const result = db
    .prepare(
      "UPDATE automod_logs SET contest_status = ? WHERE guild = ? AND channel = ? AND message = ? AND contest_status = 'pending'",
    )
    .run(status, guildId, channelId, messageId);
  return Number(result.changes) > 0;
}

function markContested(
  db,
  { guildId, channelId, messageId },
  date = Date.now(),
) {
  const result = db
    .prepare(
      "UPDATE automod_logs SET contested_at = ?, contest_status = 'pending' WHERE guild = ? AND channel = ? AND message = ? AND contested_at IS NULL",
    )
    .run(date, guildId, channelId, messageId);
  return Number(result.changes) > 0;
}

function setContestChannel(
  db,
  { guildId, channelId, messageId },
  contestChannelId,
) {
  db.prepare(
    "UPDATE automod_logs SET contest_channel = ? WHERE guild = ? AND channel = ? AND message = ?",
  ).run(contestChannelId, guildId, channelId, messageId);
}

function getExpiredLogs(db, now = Date.now(), limit = PURGE_BATCH) {
  return db
    .prepare(
      "SELECT guild, channel, message FROM automod_logs WHERE created_at <= ? ORDER BY created_at LIMIT ?",
    )
    .all(now - RETENTION, limit)
    .map((row) => ({
      guildId: String(row.guild),
      channelId: String(row.channel),
      messageId: String(row.message),
    }));
}

function deleteLog(db, { guildId, channelId, messageId }) {
  db.prepare(
    "DELETE FROM automod_logs WHERE guild = ? AND channel = ? AND message = ?",
  ).run(guildId, channelId, messageId);
}

async function sendLog(bot, guild, logChannelId, data) {
  if (logChannelId === null) return null;
  const channel = guild.channels.cache.get(logChannelId);
  if (!channel?.isTextBased()) return null;

  const message = await channel.send(buildLogMessage(data)).catch(() => null);
  if (message === null) return null;

  addLog(bot.db, {
    guildId: guild.id,
    channelId: channel.id,
    messageId: message.id,
    userId: data.userId,
    date: data.date,
  });
  return message;
}

async function purgeLogs(bot, now = Date.now()) {
  const expired = getExpiredLogs(bot.db, now);
  for (const log of expired) {
    const channel = await bot.channels.fetch(log.channelId).catch(() => null);
    await channel?.messages?.delete(log.messageId).catch(() => {});
    deleteLog(bot.db, log);
  }
  return expired.length;
}

module.exports = {
  addLog,
  getLog,
  markContested,
  setContestStatus,
  setContestChannel,
  getLogByContestChannel,
  isContestChannel,
  setJudged,
  clearContestChannel,
  getExpiredLogs,
  deleteLog,
  sendLog,
  purgeLogs,
};
