const { purgeChannel } = require("../utils/channelCleanup");

module.exports = async (bot, channel) => {
  if (!channel.guildId) return;
  purgeChannel(bot.db, channel.guildId, channel.id);
};
