const { MessageFlags } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const {
  isPeriod,
  isType,
  buildLeaderboardMessage,
} = require("../utils/leaderboardCommand");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = defineComponent({
  id: "leaderboard",

  async run(bot, interaction, [action, type, period, authorId], db) {
    if (interaction.user.id !== authorId)
      return refuse(
        interaction,
        "Seule la personne qui a lancé la commande peut changer le classement.",
      );

    const choice = interaction.isStringSelectMenu()
      ? interaction.values[0]
      : type;
    const next = { type: action === "type" ? choice : type, period };

    if (
      !["type", "period"].includes(action) ||
      !isType(next.type) ||
      !isPeriod(next.period)
    )
      return refuse(interaction, "Ce bouton n'est plus actif.");

    await interaction.deferUpdate();
    await interaction.editReply(
      await buildLeaderboardMessage(db, interaction.guild, {
        ...next,
        authorId,
      }),
    );
  },
});
