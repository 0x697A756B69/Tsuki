const { getRaidSettings } = require("../utils/raid/raidSettings");
const { observeJoin } = require("../utils/raid/raidWatch");
const { announceRaid } = require("../utils/raid/raidAlert");
const { respondToRaid } = require("../utils/raid/raidResponse");
const { syncLockdown } = require("../utils/raid/raidLockdown");

module.exports = async (bot, member) => {
  if (member.user.bot) return;
  const settings = getRaidSettings(bot.db, member.guild.id);
  if (!settings.enabled) return;

  const now = Date.now();
  const result = observeJoin(
    bot.db,
    bot.raidMemory,
    member.guild.id,
    {
      user: member.id,
      name: member.user.username,
      createdAt: member.user.createdTimestamp,
      joinedAt: now,
      hasAvatar: member.user.avatar !== null,
      invite: null,
    },
    settings,
    now,
  );
  const response = await respondToRaid(bot, member.guild, settings, result);
  const lockdown = await syncLockdown(
    bot.db,
    member.guild,
    settings,
    result.evaluation.tier,
    now,
  );
  if (result.evaluation.changed)
    await announceRaid(
      bot,
      member.guild,
      settings,
      result,
      now,
      response,
      lockdown,
    );
};
