const { toDay } = require("./xp");

function addMessage(db, guildId, channelId, userId, date = new Date()) {
  db.prepare(
    `INSERT INTO message_daily (guild, day, channel, user, messages) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (guild, day, channel, user) DO UPDATE SET messages = messages + 1`,
  ).run(guildId, toDay(date), channelId, userId);
}

module.exports = { addMessage };
