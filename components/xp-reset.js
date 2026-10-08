const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { resetXp } = require("../utils/xp");
const { updateRewardRoles } = require("../utils/rewards");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = defineComponent({
  id: "xp-reset",

  async run(bot, interaction, [action, userId, authorId], db) {
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
      const previousTotal = resetXp(db, interaction.guildId, userId);
      const member = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);
      if (member) await updateRewardRoles(db, interaction.guildId, member, 0);
      return interaction.update({
        content: `🗑️ L'XP de <@${userId}> a été remise à zéro (**${previousTotal} XP** effacés).`,
        components: [],
      });
    }
  },
});
