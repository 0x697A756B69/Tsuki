const { scanVoice } = require("../utils/voiceScan");
const { purgeLogs } = require("../utils/automodLogs");
const { sweepRooms } = require("../utils/automodRooms");
const { sweepDeletedChannels } = require("../utils/channelCleanup");
const { purgeRaidLogs } = require("../utils/raidLog");
const { sweepRaids } = require("../utils/raidAlert");
const { sweepMutes } = require("../utils/muteSweep");

const SCAN_INTERVAL = 60 * 1000;
const PURGE_INTERVAL = 60 * 60 * 1000;

module.exports = async (bot) => {
  console.log(`Logged in as ${bot.user.tag}`);

  if (!bot.cleanupDone) {
    bot.cleanupDone = true;
    sweepDeletedChannels(bot).catch((err) =>
      console.error("[channel cleanup]", err),
    );
  }

  if (!bot.purgeTimer) {
    const purge = () => {
      purgeLogs(bot).catch((err) => console.error("[automod purge]", err));
      sweepRooms(bot).catch((err) => console.error("[automod rooms]", err));
      purgeRaidLogs(bot.db);
    };
    purge();
    bot.purgeTimer = setInterval(purge, PURGE_INTERVAL);
  }

  if (!bot.raidTimer)
    bot.raidTimer = setInterval(
      () => sweepRaids(bot).catch((err) => console.error("[raid sweep]", err)),
      SCAN_INTERVAL,
    );

  if (!bot.muteTimer)
    bot.muteTimer = setInterval(
      () => sweepMutes(bot).catch((err) => console.error("[mute sweep]", err)),
      SCAN_INTERVAL,
    );

  if (bot.voiceTimer) return;
  bot.voiceTimer = setInterval(
    () => scanVoice(bot).catch((err) => console.error("[voice scan]", err)),
    SCAN_INTERVAL,
  );
};
