const { scanVoice } = require("../utils/xp/voiceScan");
const { purgeLogs } = require("../utils/automodLogs");
const { sweepRooms, remindRooms } = require("../utils/automodRooms");
const { sweepDeletedChannels } = require("../utils/core/channelCleanup");
const { purgeRaidLogs } = require("../utils/raid/raidLog");
const { sweepRaids } = require("../utils/raid/raidAlert");
const { sweepMutes } = require("../utils/moderation/muteSweep");
const { every } = require("../utils/core/every");

const SCAN_INTERVAL = 60 * 1000;
const PURGE_INTERVAL = 60 * 60 * 1000;

module.exports = async (bot) => {
  console.log(`Logged in as ${bot.user.tag}`);

  bot.raidMemory ??= new Map();

  if (!bot.cleanupDone) {
    bot.cleanupDone = true;
    sweepDeletedChannels(bot).catch((err) =>
      console.error("[channel cleanup]", err),
    );
  }

  if (bot.timers) return;
  bot.timers = {
    purgeLogs: every("automod purge", PURGE_INTERVAL, () => purgeLogs(bot)),
    purgeRooms: every("automod rooms", PURGE_INTERVAL, () => sweepRooms(bot)),
    purgeRaid: every("raid purge", PURGE_INTERVAL, () => purgeRaidLogs(bot.db)),
    raid: every("raid sweep", SCAN_INTERVAL, () => sweepRaids(bot)),
    rooms: every("room reminder", SCAN_INTERVAL, () => remindRooms(bot)),
    mutes: every("mute sweep", SCAN_INTERVAL, () => sweepMutes(bot)),
    voice: every("voice scan", SCAN_INTERVAL, () => scanVoice(bot)),
  };
  for (const name of ["purgeLogs", "purgeRooms", "purgeRaid"])
    bot.timers[name].run();
};
