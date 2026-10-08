const { MessageFlags } = require("discord.js");
const defineSubcommand = require("../../utils/defineSubcommand");
const { mainView } = require("../../utils/xpConfig");

module.exports = defineSubcommand({
  name: "config",
  description: "Ouvrir le panneau de réglages des niveaux.",

  async run(bot, interaction, args, db) {
    await interaction.reply({
      ...mainView(interaction, db),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
});
