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
  accept: {
    permission: PermissionFlagsBits.ManageMessages,
    label: "contestation acceptée",
  },
  refuse: {
    permission: PermissionFlagsBits.ManageMessages,
    label: "contestation refusée",
  },
  closeroom: {
    permission: PermissionFlagsBits.ManageMessages,
    label: "salon clos",
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

const LIFTED = {
  timeout: " et ta sourdine est levée",
  ban: " et ton bannissement est levé",
};

function contestVerdict(guildName, accepted, lifted = null) {
  if (!accepted)
    return `Ta contestation sur ${guildName} a été refusée : l'avertissement est maintenu.`;
  return `Ta contestation sur ${guildName} a été acceptée : ton avertissement est retiré${LIFTED[lifted] ?? ""}.`;
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
  contestVerdict,
  banConfirmation,
};
