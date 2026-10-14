const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/core/defineComponent");
const { previewReset, resetXp } = require("../utils/xp/xp");
const { getLevelProgress } = require("../utils/xp/levels");
const { formatResetDone } = require("../utils/xp/xpAdmin");
const { updateRewardRoles } = require("../utils/xp/rewards");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = defineComponent({
  id: "xp-reset",

  async run(bot, interaction, [action, userId, authorId, type = "all"], db) {
    if (!interaction.isButton()) return;

    if (interaction.user.id !== authorId)
      return refuse(
        interaction,
        "Seule la personne qui a lancé la commande peut répondre.",
      );
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
      return refuse(
        interaction,
        "Il faut la permission « Gérer le serveur » pour réinitialiser l'XP.",
      );

    if (action === "cancel")
      return interaction.update({
        content: "Réinitialisation annulée.",
        components: [],
      });

    if (action === "confirm") {
      const { before, after } = previewReset(
        db,
        interaction.guildId,
        userId,
        type,
      );
      resetXp(db, interaction.guildId, userId, type);
      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);
      if (member)
        await updateRewardRoles(
          db,
          interaction.guildId,
          member,
          getLevelProgress(after).level,
        );
      return interaction.update({
        content: formatResetDone({ userId, type, before, after }),
        components: [],
      });
    }
  },
});
