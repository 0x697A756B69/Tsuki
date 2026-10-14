const { getAutomodSettings } = require("../utils/automodSettings");
const { denyMuteRole } = require("../utils/moderation/muteRole");

module.exports = async (bot, channel) => {
  if (!channel.guildId) return;
  const { muteRole } = getAutomodSettings(bot.db, channel.guildId);
  if (muteRole === null) return;
  await denyMuteRole(channel, muteRole);
};
