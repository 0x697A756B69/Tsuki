const { randomInt } = require("node:crypto");
const { getSettings } = require("../utils/settings");
const { addXp } = require("../utils/xp");
const { createMessageXpTracker } = require("../utils/messageXp");
const { getModifiers, computeMultiplier } = require("../utils/modifiers");
const { announceLevelUp } = require("../utils/announce");

const tracker = createMessageXpTracker();

module.exports = async (bot, message) => {
  if (message.author.bot || !message.inGuild()) return;

  const context = {
    channelId: message.channelId,
    parentId: message.channel.isThread() ? message.channel.parentId : null,
    roleIds: [...message.member.roles.cache.keys()],
  };
  const modifiers = getModifiers(bot.db, message.guildId);
  if (computeMultiplier(modifiers, context) === 0) return;

  const settings = getSettings(bot.db, message.guildId);
  const result = tracker.evaluate(
    {
      guildId: message.guildId,
      channelId: message.channelId,
      authorId: message.author.id,
      content: message.content,
      repliesTo: message.mentions.repliedUser?.id ?? null,
    },
    settings.cooldown,
  );
  if (!result.eligible) return;

  const multiplier = computeMultiplier(modifiers, context, result.multiplier);
  const gain = Math.round(
    randomInt(settings.xpMin, settings.xpMax + 1) * multiplier,
  );
  const { previousLevel, level } = addXp(
    bot.db,
    message.guildId,
    message.author.id,
    gain,
  );

  if (level > previousLevel)
    await announceLevelUp({
      settings,
      member: message.member,
      level,
      channel: message.channel,
    });
};
