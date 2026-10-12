const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { buildCustomId } = require("./customId");

const RAID_ACTION_ID = "raid-action";

const RAID_ACTIONS = {
  free: {
    permission: PermissionFlagsBits.ModerateMembers,
    name: "Modérer les membres",
  },
  ban: {
    permission: PermissionFlagsBits.BanMembers,
    name: "Bannir des membres",
  },
  banok: {
    permission: PermissionFlagsBits.BanMembers,
    name: "Bannir des membres",
  },
  bancancel: { permission: null, name: null },
  lift: {
    permission: PermissionFlagsBits.ManageGuild,
    name: "Gérer le serveur",
  },
  extend: {
    permission: PermissionFlagsBits.ManageGuild,
    name: "Gérer le serveur",
  },
};

function parseRaidAction(params) {
  const [action] = params;
  return Object.hasOwn(RAID_ACTIONS, action) ? { action } : null;
}

function missingRaidPermission(action, permissions) {
  const { permission, name } = RAID_ACTIONS[action];
  if (permission === null || permissions.has(permission)) return null;
  return `Il faut la permission « ${name} » pour faire ça.`;
}

function buildRaidButtons() {
  const button = (action, label, style) =>
    new ButtonBuilder()
      .setCustomId(buildCustomId(RAID_ACTION_ID, action))
      .setLabel(label)
      .setStyle(style);
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    button("free", "Libérer", ButtonStyle.Secondary),
    button("ban", "Bannir le groupe", ButtonStyle.Danger),
    button("lift", "Tout lever", ButtonStyle.Success),
    button("extend", "Prolonger", ButtonStyle.Primary),
  );
}

function banGroupConfirmation({ users, signals }) {
  const reasons = Object.entries(signals)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label} : ${count}`);
  const row = /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(RAID_ACTION_ID, "banok"))
      .setLabel("Confirmer le bannissement")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildCustomId(RAID_ACTION_ID, "bancancel"))
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Secondary),
  );
  const lines = [
    `Bannir **${users.length}** membre${users.length > 1 ? "s" : ""} du groupe ?`,
    reasons.length > 0
      ? `Signaux : ${reasons.join(" · ")}`
      : "Aucun signal particulier : ils sont visés uniquement pour leur arrivée groupée.",
    `Comptes : ${users
      .slice(0, 10)
      .map((user) => `<@${user}>`)
      .join(
        " ",
      )}${users.length > 10 ? ` … et ${users.length - 10} autre${users.length - 10 > 1 ? "s" : ""}` : ""}`,
  ];
  return {
    content: lines.join("\n"),
    components: [row],
    flags: /** @type {MessageFlags.Ephemeral} */ (MessageFlags.Ephemeral),
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  RAID_ACTION_ID,
  RAID_ACTIONS,
  banGroupConfirmation,
  buildRaidButtons,
  missingRaidPermission,
  parseRaidAction,
};
