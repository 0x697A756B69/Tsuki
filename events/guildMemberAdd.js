const { getRaidSettings } = require("../utils/raidSettings");
const { observeJoin } = require("../utils/raidWatch");
const { announceRaid } = require("../utils/raidAlert");
const { respondToRaid } = require("../utils/raidResponse");

module.exports = async (bot, member) => {
  if (member.user.bot) return;
  const settings = getRaidSettings(bot.db, member.guild.id);
  if (!settings.enabled) return;

  bot.raidMemory ??= new Map();
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
  if (result.evaluation.changed)
    await announceRaid(bot, member.guild, settings, result, now, response);
};
