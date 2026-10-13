const { clearContestChannel } = require("./automodLogs");
const { getAutomodSettings } = require("./automodSettings");
const { archiveTranscript } = require("./automodJustice");

const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
const REMINDER_LEAD = 60 * 60 * 1000;
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
      "SELECT guild, channel, message, contest_channel FROM automod_logs WHERE contest_channel IS NOT NULL AND judged_at IS NOT NULL AND room_reminded = 0 AND judged_at + room_extra <= ? AND judged_at + room_extra > ? ORDER BY judged_at + room_extra LIMIT ?",
    )
    .all(now - ROOM_LIFETIME + REMINDER_LEAD, now - ROOM_LIFETIME, limit)
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

async function closeRoom(bot, room, reason) {
  clearContestChannel(bot.db, room.ref);
  const guild = await bot.guilds.fetch(room.ref.guildId).catch(() => null);
  const channel = await guild?.channels
    .fetch(room.contestChannel)
    .catch(() => null);
  if (!channel) return false;
  await archiveTranscript(
    guild,
    getAutomodSettings(bot.db, room.ref.guildId),
    channel,
  ).catch(() => {});
  await channel.delete(reason).catch(() => {});
  return true;
}

async function sweepRooms(bot, now = Date.now()) {
  const rooms = getExpiredRooms(bot.db, now);
  for (const room of rooms)
    await closeRoom(bot, room, "AutoMod : salon expiré");
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
  REMINDER_LEAD,
  ROOM_EXTENSION,
  SWEEP_BATCH,
  getExpiredRooms,
  getRoomsToRemind,
  markReminded,
  extendRoom,
  getMemberRooms,
  closeRoom,
  sweepRooms,
  closeMemberRooms,
};
