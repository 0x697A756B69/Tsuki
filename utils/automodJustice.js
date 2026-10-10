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
const TRANSCRIPT_NOTICE = "-# Cette discussion est conservée pour l'équipe";
const TRANSCRIPT_PAGES = 10;
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
  keepTranscript = false,
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

  const container = new ContainerBuilder().setAccentColor(CONTEST_COLOR);
  container.addTextDisplayComponents(text(`## Contestation de <@${userId}>`));
  if (keepTranscript)
    container.addTextDisplayComponents(text(TRANSCRIPT_NOTICE));
  container
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

function pad(value) {
  return String(value).padStart(2, "0");
}

function transcriptFileName(channelName, now) {
  const date = new Date(now);
  return `${channelName}-${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}.txt`;
}

function formatTranscript(messages) {
  const lines = [...messages]
    .filter((message) => message.content !== "" || message.files.length > 0)
    .sort((a, b) => a.at - b.at)
    .map((message) => {
      const date = new Date(message.at);
      const stamp = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
      const body = [
        ...message.content.split("\n").filter((line) => line !== ""),
        ...message.files.map((url) => `[fichier : ${url}]`),
      ];
      return `[${stamp}] ${message.author} : ${body.join("\n    ")}`;
    });
  return lines.length === 0 ? "Aucun message." : lines.join("\n");
}

async function archiveTranscript(guild, settings, channel) {
  if (!settings.keepTranscript || settings.logChannel === null) return;
  const target = await guild.channels
    .fetch(settings.logChannel)
    .catch(() => null);
  if (!target?.isTextBased()) return;

  const collected = [];
  let before;
  for (let page = 0; page < TRANSCRIPT_PAGES; page++) {
    const batch = await channel.messages
      .fetch({ limit: 100, before })
      .catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    before = batch.lastKey();
    if (batch.size < 100) break;
  }

  const messages = collected
    .filter((message) => !message.author.bot)
    .map((message) => ({
      at: message.createdTimestamp,
      author: message.author.username,
      content: message.content,
      files: [...message.attachments.values()].map((file) => file.url),
    }));
  await target
    .send({
      content: `Discussion de contestation conservée (${channel.name}).`,
      files: [
        {
          attachment: Buffer.from(formatTranscript(messages), "utf8"),
          name: transcriptFileName(channel.name, Date.now()),
        },
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

module.exports = {
  NAME_PREFIX,
  TRANSCRIPT_NOTICE,
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
  transcriptFileName,
  formatTranscript,
  archiveTranscript,
};
