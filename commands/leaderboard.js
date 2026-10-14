const defineCommand = require("../utils/core/defineCommand");
const { buildLeaderboardMessage } = require("../utils/xp/leaderboardCommand");

module.exports = defineCommand({
  name: "leaderboard",
  description: "Voir le classement du serveur.",
  permission: "Aucune",
  category: "Expérience",
  dm: false,

  async run(bot, interaction, args, db) {
    await interaction.deferReply();
    await interaction.editReply(
      await buildLeaderboardMessage(db, interaction.guild, {
        type: "messages",
        period: "global",
        authorId: interaction.user.id,
      }),
    );
  },
});
