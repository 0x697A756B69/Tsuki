const { MessageFlags } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { getAutomodSettings } = require("../utils/automodSettings");
const { listWarnings } = require("../utils/warnSanctions");
const { warnlistView } = require("../utils/warnlistPanel");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = defineComponent({
  id: "warnlist",

  async run(bot, interaction, [action, userId, page, authorId], db) {
    if (interaction.user.id !== authorId)
      return refuse(
        interaction,
        "Seule la personne qui a lancé la commande peut changer de page.",
      );
    if (action !== "page" || !Number.isInteger(Number(page)))
      return refuse(interaction, "Ce bouton n'est plus actif.");

    const user = await bot.users.fetch(userId).catch(() => null);
    if (!user) return refuse(interaction, "Ce membre est introuvable.");

    const { warnValidDays } = getAutomodSettings(db, interaction.guildId);
    const warnings = listWarnings(
      db,
      interaction.guildId,
      userId,
      warnValidDays,
    );
    await interaction.deferUpdate();
    await interaction.editReply(
      warnlistView({ user, warnings, page: Number(page), authorId }),
    );
  },
});
