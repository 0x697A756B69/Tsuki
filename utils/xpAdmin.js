const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildCustomId } = require("./customId");

function checkMember(member) {
  if (!member) return "Ce membre n'est pas sur le serveur.";
  if (member.user.bot) return "Les bots n'ont pas d'XP.";
  return null;
}

function checkAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount < 1)
    return "Le montant doit être d'au moins 1 XP.";
  return null;
}

function formatAdjustment(member, { level, previousTotal, total }) {
  const delta = total - previousTotal;
  const summary = `Niveau ${level} · ${total} XP au total`;

  if (delta > 0) return `✨ ${member} a reçu **${delta} XP**.\n> ${summary}`;
  if (delta < 0) return `➖ ${member} a perdu **${-delta} XP**.\n> ${summary}`;
  return `${member} n'a pas changé d'XP.\n> ${summary}`;
}

function renderResetConfirm({ userId, authorId, total }) {
  return {
    content: `⚠️ Remettre à zéro l'XP de <@${userId}> ? Il a actuellement **${total} XP**. Cette action est définitive.`,
    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId("xp-reset", "confirm", userId, authorId))
            .setLabel("Confirmer")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(buildCustomId("xp-reset", "cancel", userId, authorId))
            .setLabel("Annuler")
            .setStyle(ButtonStyle.Secondary),
        )
        .toJSON(),
    ],
  };
}

module.exports = {
  checkMember,
  checkAmount,
  formatAdjustment,
  renderResetConfirm,
};
