const { PermissionFlagsBits } = require("discord.js");
const defineGroup = require("../../../../utils/defineGroup");

module.exports = defineGroup({
  name: "admin",
  description: "Admin.",
  permission: PermissionFlagsBits.ManageGuild,
  category: "Test",
  dm: false,
});
