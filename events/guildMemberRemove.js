const { closeMemberRooms } = require("../utils/automodRooms");

module.exports = async (bot, member) => {
  await closeMemberRooms(bot, member.guild.id, member.id);
};
