const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { CONTEST_COLOR, reviewRow } = require("./automodContest");
const { ACTION_ID, excerpt, resolvedNotice } = require("./automodLogs");
const { buildCustomId } = require("./customId");

const NAME_PREFIX = "contestation-";
const NAME_LENGTH = 40;
const VERDICT_COLOR = 0x8e8e93;
const SANCTION_LABELS = {
  timeout: "Mise en sourdine",
  kick: "Expulsion",
  ban: "Bannissement",
};

function contestChannelName(name) {
  const slug = String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_LENGTH)
    .replace(/-+$/g, "");
  return `${NAME_PREFIX}${slug === "" ? "membre" : slug}`;
}

function moderatorRoleIds(roles, guildId) {
  return [...roles]
    .filter(
      (role) =>
        role.id !== guildId &&
        role.permissions.has(PermissionFlagsBits.ManageMessages),
    )
    .map((role) => role.id);
}

function contestOverwrites({ guildId, memberId, botId, moderatorIds }) {
  const talk = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  return [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: memberId, allow: talk },
    {
      id: botId,
      allow: [
        ...talk,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    ...moderatorIds.map((id) => ({
      id,
      allow: [...talk, PermissionFlagsBits.ManageMessages],
    })),
  ];
}

function canOpenContestChannel(category, botPermissions) {
  return (
    category?.type === ChannelType.GuildCategory &&
    botPermissions.has(PermissionFlagsBits.ManageChannels)
  );
}

function sanctionLabel(sanction, timeoutUntil = null) {
  const label = SANCTION_LABELS[sanction];
  if (!label) return "Aucune";
  return sanction === "timeout" && timeoutUntil !== null
    ? `${label} jusqu'au <t:${Math.floor(timeoutUntil / 1000)}:f>`
    : label;
}

function logSummary(container) {
  const texts = container.components
    .filter((part) => part.type === 10)
    .map((part) => part.content);
  const title = texts.find((content) => content.startsWith("## ")) ?? "";
  const quote = texts
    .flatMap((content) => content.split("\n"))
    .find((line) => line.startsWith("> "));
  return {
    rule: title.includes(" : ") ? title.slice(title.indexOf(" : ") + 3) : null,
    blocked: quote ? quote.slice(2) : null,
  };
}

function buildContestMessage({
  userId,
  rule,
  warningId,
  sanction,
  reason,
  blocked,
}) {
  const text = (value) => new TextDisplayBuilder().setContent(value);
  const quote = (value) =>
    value
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  const memberQuote = reason === null ? "Aucun motif donné." : quote(reason);
  const blockedQuote =
    excerpt(blocked) === null
      ? "Message indisponible."
      : quote(excerpt(blocked));

  const container = new ContainerBuilder()
    .setAccentColor(CONTEST_COLOR)
    .addTextDisplayComponents(text(`## Contestation de <@${userId}>`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        `**Raison :** ${rule ?? "Inconnue"}\n**Avertissement :** ${warningId ?? "Aucun"}\n**Sanction :** ${sanction}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(`**Message bloqué :**\n${blockedQuote}`),
      text(`**Explication du membre :**\n${memberQuote}`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text("-# En attente d'un modérateur"))
    .addActionRowComponents(reviewRow({ userId, warningId }));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function closeRow() {
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(ACTION_ID, "closeroom"))
      .setLabel("Clore le salon")
      .setStyle(ButtonStyle.Secondary),
  );
}

function verdictPayload(container, resolved) {
  const parts = container.components.filter(
    (part) => part.type !== ComponentType.ActionRow,
  );
  const last = parts.length - 1;
  parts[last] = {
    ...parts[last],
    content: `-# ${resolvedNotice(resolved)}`,
  };
  parts.push(closeRow().toJSON());
  return {
    components: [
      { ...container, accent_color: VERDICT_COLOR, components: parts },
    ],
    flags: /** @type {MessageFlags.IsComponentsV2} */ (
      MessageFlags.IsComponentsV2
    ),
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  NAME_PREFIX,
  VERDICT_COLOR,
  closeRow,
  verdictPayload,
  contestChannelName,
  moderatorRoleIds,
  contestOverwrites,
  canOpenContestChannel,
  sanctionLabel,
  logSummary,
  buildContestMessage,
};
