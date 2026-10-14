const { PermissionFlagsBits } = require("discord.js");
const defineGroup = require("../../utils/core/defineGroup");

module.exports = defineGroup({
  name: "contest",
  description: "Gérer les témoins d'un salon de contestation.",
  permission: PermissionFlagsBits.ManageMessages,
  category: "Modération",
  dm: false,
});
