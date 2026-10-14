const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildCustomId } = require("./core/customId");

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

const RESET_LABELS = { all: "tout", messages: "messages", voice: "vocal" };

function getResetLabel(type) {
  const label = RESET_LABELS[type];
  if (!label) throw new RangeError(`Unknown reset type: ${type}`);
  return label;
}

function formatResetDone({ userId, type, before, after }) {
  return `🗑️ XP (${getResetLabel(type)}) de <@${userId}> remise à zéro : **${before} XP** → **${after} XP**.`;
}

function renderResetConfirm({ userId, authorId, type = "all", before, after }) {
  return {
    content: `⚠️ Remettre à zéro l'XP (${getResetLabel(type)}) de <@${userId}> ? Son total passera de **${before} XP** à **${after} XP**. Cette action est définitive.`,
    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              buildCustomId("xp-reset", "confirm", userId, authorId, type),
            )
            .setLabel("Confirmer")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(
              buildCustomId("xp-reset", "cancel", userId, authorId, type),
            )
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
  formatResetDone,
  renderResetConfirm,
};
