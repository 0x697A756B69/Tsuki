const { toDay } = require("./xp");

function addVoiceMinute(db, guildId, userId, date = new Date()) {
  db.prepare(
    `INSERT INTO voice_daily (guild, day, user, minutes) VALUES (?, ?, ?, 1)
     ON CONFLICT (guild, day, user) DO UPDATE SET minutes = minutes + 1`,
  ).run(guildId, toDay(date), userId);
}

module.exports = { addVoiceMinute };
