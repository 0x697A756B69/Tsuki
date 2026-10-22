const { clearContestChannel } = require("./automodLogs");
const { getAutomodSettings } = require("./automodSettings");
const { archiveTranscript, reminderMessage } = require("./automodJustice");

const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ROOM_EXTENSION = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 50;

function toRoom(row) {
  return {
    ref: {
      guildId: String(row.guild),
      channelId: String(row.channel),
      messageId: String(row.message),
    },
    contestChannel: String(row.contest_channel),
  };
}

function getExpiredRooms(db, now = Date.now(), limit = SWEEP_BATCH) {
  return db
    .prepare(
      "SELECT guild, channel, message, contest_channel FROM automod_logs WHERE contest_channel IS NOT NULL AND judged_at IS NOT NULL AND judged_at + room_extra <= ? ORDER BY judged_at + room_extra LIMIT ?",
    )
    .all(now - ROOM_LIFETIME, limit)
    .map(toRoom);
}

function getRoomsToRemind(db, now = Date.now(), limit = SWEEP_BATCH) {
  return db
    .prepare(
      `SELECT l.guild, l.channel, l.message, l.contest_channel
       FROM automod_logs l
       LEFT JOIN automod_settings s ON s.guild = l.guild
       WHERE l.contest_channel IS NOT NULL
         AND l.judged_at IS NOT NULL
         AND l.room_reminded = 0
         AND COALESCE(s.reminder_hours, 1) > 0
         AND l.judged_at + l.room_extra <= ? + COALESCE(s.reminder_hours, 1) * ?
         AND l.judged_at + l.room_extra > ?
       ORDER BY l.judged_at + l.room_extra
       LIMIT ?`,
    )
    .all(now - ROOM_LIFETIME, HOUR, now - ROOM_LIFETIME, limit)
    .map(toRoom);
}

function markReminded(db, ref) {
  db.prepare(
    "UPDATE automod_logs SET room_reminded = 1 WHERE guild = ? AND channel = ? AND message = ?",
  ).run(ref.guildId, ref.channelId, ref.messageId);
}

function extendRoom(db, ref) {
  db.prepare(
    "UPDATE automod_logs SET room_extra = room_extra + ?, room_reminded = 0 WHERE guild = ? AND channel = ? AND message = ?",
  ).run(ROOM_EXTENSION, ref.guildId, ref.channelId, ref.messageId);
}

function getMemberRooms(db, guildId, userId) {
  return db
    .prepare(
      "SELECT guild, channel, message, contest_channel FROM automod_logs WHERE guild = ? AND user_id = ? AND contest_channel IS NOT NULL",
    )
    .all(guildId, userId)
    .map(toRoom);
}

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_GUILD = 10004;

function isGone(err) {
  return err?.code === UNKNOWN_CHANNEL || err?.code === UNKNOWN_GUILD;
}

async function closeRoom(bot, room, reason) {
  let guild;
  let channel;
  try {
    guild = await bot.guilds.fetch(room.ref.guildId);
    channel = await guild.channels.fetch(room.contestChannel);
  } catch (err) {
    if (isGone(err)) clearContestChannel(bot.db, room.ref);
    return false;
  }
  if (!channel) {
    clearContestChannel(bot.db, room.ref);
    return false;
  }
  const archived = await archiveTranscript(
    guild,
    getAutomodSettings(bot.db, room.ref.guildId),
    channel,
  ).catch(() => false);
  if (!archived) return false;
  clearContestChannel(bot.db, room.ref);
  await channel.delete(reason).catch(() => {});
  return true;
}

async function sweepRooms(bot, now = Date.now()) {
  const rooms = getExpiredRooms(bot.db, now);
  for (const room of rooms)
    await closeRoom(bot, room, "AutoMod : salon expiré");
  return rooms.length;
}

async function remindRooms(bot, now = Date.now()) {
  const rooms = getRoomsToRemind(bot.db, now);
  for (const room of rooms) {
    markReminded(bot.db, room.ref);
    const guild = await bot.guilds.fetch(room.ref.guildId).catch(() => null);
    const channel = await guild?.channels
      .fetch(room.contestChannel)
      .catch(() => null);
    await channel?.send(reminderMessage()).catch(() => {});
  }
  return rooms.length;
}

async function closeMemberRooms(bot, guildId, userId) {
  const rooms = getMemberRooms(bot.db, guildId, userId);
  for (const room of rooms)
    await closeRoom(bot, room, "AutoMod : le membre a quitté le serveur");
  return rooms.length;
}

module.exports = {
  ROOM_LIFETIME,
  HOUR,
  ROOM_EXTENSION,
  SWEEP_BATCH,
  getExpiredRooms,
  getRoomsToRemind,
  markReminded,
  extendRoom,
  getMemberRooms,
  closeRoom,
  sweepRooms,
  remindRooms,
  closeMemberRooms,
};
