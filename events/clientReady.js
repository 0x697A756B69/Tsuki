const { scanVoice } = require("../utils/voiceScan");
const { purgeLogs } = require("../utils/automodLogs");
const { sweepRooms } = require("../utils/automodRooms");

const SCAN_INTERVAL = 60 * 1000;
const PURGE_INTERVAL = 60 * 60 * 1000;

module.exports = async (bot) => {
  console.log(`Logged in as ${bot.user.tag}`);

  if (!bot.purgeTimer) {
    const purge = () => {
      purgeLogs(bot).catch((err) => console.error("[automod purge]", err));
      sweepRooms(bot).catch((err) => console.error("[automod rooms]", err));
    };
    purge();
    bot.purgeTimer = setInterval(purge, PURGE_INTERVAL);
  }

  if (bot.voiceTimer) return;
  bot.voiceTimer = setInterval(
    () => scanVoice(bot).catch((err) => console.error("[voice scan]", err)),
    SCAN_INTERVAL,
  );
};
