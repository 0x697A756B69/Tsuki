const { PermissionFlagsBits } = require("discord.js");
const defineGroup = require("../../utils/defineGroup");

module.exports = defineGroup({
  name: "automod",
  description: "Gérer la modération automatique.",
  permission: PermissionFlagsBits.ManageGuild,
  category: "Modération",
  dm: false,
});
