const { randomInt } = require("node:crypto");
const { getSettings } = require("../utils/settings");
const { addXp } = require("../utils/xp");
const { createMessageXpTracker } = require("../utils/messageXp");
const { announceLevelUp } = require("../utils/announce)");

const tracker = createMessageXpTracker();

module.exports = async (bot, message) => {
  if (message.author.bot || !message.inGuild()) return;

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

  const gain = Math.round(
    randomInt(settings.xpMin, settings.xpMax + 1) * result.multiplier,
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
