const { PermissionFlagsBits } = require("discord.js");
const defineGroup = require("../../utils/defineGroup");

module.exports = defineGroup({
  name: "xp",
  description: "Gérer le système de niveaux.",
  permission: PermissionFlagsBits.ManageGuild,
  category: "Expérience",
  dm: false,
});
