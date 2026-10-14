const { MessageFlags } = require("discord.js");
const defineSubcommand = require("../../utils/core/defineSubcommand");
const { previewReset } = require("../../utils/xp/xp");
const { renderResetConfirm } = require("../../utils/xp/xpAdmin");

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
    {
      type: "string",
      name: "type",
      description: "Le type d'XP à remettre à zéro (tout par défaut).",
      choices: [
        { name: "Tout", value: "all" },
        { name: "Messages", value: "messages" },
        { name: "Vocal", value: "voice" },
      ],
    },
  ],

  async run(bot, interaction, args, db) {
    const user = args.getUser("membre", true);
    const type = args.getString("type") ?? "all";
    const preview = previewReset(db, interaction.guildId, user.id, type);

    if (preview.removed === 0)
      return interaction.reply({
        content: `${user} n'a pas d'XP à réinitialiser.`,
        flags: MessageFlags.Ephemeral,
      });

    await interaction.reply({
      ...renderResetConfirm({
        userId: user.id,
        authorId: interaction.user.id,
        type,
        before: preview.before,
        after: preview.after,
      }),
      flags: MessageFlags.Ephemeral,
    });
  },
});
