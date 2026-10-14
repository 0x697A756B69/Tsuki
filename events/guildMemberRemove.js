const { closeMemberRooms } = require("../utils/automod/automodRooms");

module.exports = async (bot, member) => {
  await closeMemberRooms(bot, member.guild.id, member.id);
};
