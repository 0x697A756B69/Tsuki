const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { ACTION_ID } = require("./automodLogs");
const { buildCustomId } = require("./customId");

const ACTIONS = {
  remove: {
    permission: PermissionFlagsBits.ManageMessages,
    label: "avertissement retiré",
  },
  warn: {
    permission: PermissionFlagsBits.ManageMessages,
    label: "avertissement ajouté",
  },
  delete: {
    permission: PermissionFlagsBits.ManageMessages,
    label: "message supprimé",
  },
  close: { permission: PermissionFlagsBits.ManageMessages, label: "classé" },
  timeout: {
    permission: PermissionFlagsBits.ModerateMembers,
    label: "mis en sourdine",
  },
  ban: { permission: PermissionFlagsBits.BanMembers, label: "banni" },
  banok: { permission: PermissionFlagsBits.BanMembers, label: "banni" },
  bancancel: { permission: null, label: "annulé" },
};

const PERMISSION_NAMES = new Map([
  [PermissionFlagsBits.ManageMessages, "Gérer les messages"],
  [PermissionFlagsBits.ModerateMembers, "Modérer les membres"],
  [PermissionFlagsBits.BanMembers, "Bannir des membres"],
]);

function parseAction(params) {
  const [action, ...args] = params;
  return Object.hasOwn(ACTIONS, action) ? { action, args } : null;
}

function missingPermission(action, permissions) {
  const { permission } = ACTIONS[action];
  if (permission === null || permissions.has(permission)) return null;
  return `Il faut la permission « ${PERMISSION_NAMES.get(permission)} » pour faire ça.`;
}

function removeWarning(db, guildId, userId, warningId) {
  const result = db
    .prepare("DELETE FROM warns WHERE id = ? AND guild = ? AND user = ?")
    .run(warningId, guildId, userId);
  return Number(result.changes) > 0;
}

function addModeratorWarning(
  db,
  { id, guildId, userId, moderatorId, date = Date.now() },
) {
  const reason = "AutoMod : message détecté";
  db.prepare(
    "INSERT INTO warns (id, guild, user, author, reason, date) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, guildId, userId, moderatorId, reason, date);
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM warns WHERE guild = ? AND user = ?")
    .get(guildId, userId);
  return { id, reason, total: Number(row.total) };
}

function banConfirmation(userId, messageId) {
  const row = /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(ACTION_ID, "banok", userId, messageId))
      .setLabel("Confirmer le bannissement")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildCustomId(ACTION_ID, "bancancel"))
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    content: `Bannir <@${userId}> du serveur ?`,
    components: [row],
    flags: /** @type {MessageFlags.Ephemeral} */ (MessageFlags.Ephemeral),
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  ACTIONS,
  parseAction,
  missingPermission,
  removeWarning,
  addModeratorWarning,
  banConfirmation,
};
