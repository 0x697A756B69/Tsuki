const { scanVoice } = require("../utils/voiceScan");

const SCAN_INTERVAL = 60 * 1000;

module.exports = async (bot) => {
  console.log(`Logged in as ${bot.user.tag}`);

  if (bot.voiceTimer) return;
  bot.voiceTimer = setInterval(
    () => scanVoice(bot).catch((err) => console.error("[voice scan]", err)),
    SCAN_INTERVAL,
  );
};
