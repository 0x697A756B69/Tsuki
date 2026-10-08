const { MessageFlags } = require("discord.js");
const defineSubcommand = require("../../utils/defineSubcommand");
const { getTotalXp } = require("../../utils/xp");
const { renderResetConfirm } = require("../../utils/xpAdmin");

module.exports = defineSubcommand({
  name: "reset",
  description: "Remettre à zéro l'XP d'un membre.",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à réinitialiser.",
      required: true,
    },
  ],

  async run(bot, interaction, args, db) {
    const user = args.getUser("membre", true);
    const total = getTotalXp(db, interaction.guildId, user.id);

    if (total === 0)
      return interaction.reply({
        content: `${user} n'a pas d'XP à réinitialiser.`,
        flags: MessageFlags.Ephemeral,
      });

    await interaction.reply({
      ...renderResetConfirm({
        userId: user.id,
        authorId: interaction.user.id,
        total,
      }),
      flags: MessageFlags.Ephemeral,
    });
  },
});
