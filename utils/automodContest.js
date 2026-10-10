const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { buildCustomId, parseCustomId } = require("./customId");
const { ACTION_ID } = require("./automodLogs");

const CONTEST_ID = "automod-contest";
const CONTEST_COLOR = 0x8b5cf6;
const REASON_LENGTH = 300;
const HOUR = 60 * 60 * 1000;
const NO_WARNING = "-";

function contestRow({ guildId, channelId, messageId }) {
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildCustomId(CONTEST_ID, "ask", guildId, channelId, messageId),
      )
      .setLabel("Contester")
      .setStyle(ButtonStyle.Secondary),
  );
}

function contestCheck({ log, settings, userId, now = Date.now() }) {
  if (!log || settings.contestHours === 0)
    return "La contestation n'est pas disponible pour ce blocage.";
  if (log.userId !== userId) return "Ce blocage ne te concerne pas.";
  if (log.contestedAt !== null) return "Tu as déjà contesté ce blocage.";
  if (now > log.createdAt + settings.contestHours * HOUR)
    return "Le délai pour contester ce blocage est dépassé.";
  return null;
}

function contestClosed({ log, settings, now = Date.now() }) {
  if (!log || settings.contestHours === 0) return true;
  return (
    log.contestedAt !== null ||
    now > log.createdAt + settings.contestHours * HOUR
  );
}

function renderContestModal(ref) {
  return new ModalBuilder()
    .setCustomId(
      buildCustomId(
        CONTEST_ID,
        "send",
        ref.guildId,
        ref.channelId,
        ref.messageId,
      ),
    )
    .setTitle("Contester le blocage")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Motif (facultatif)")
        .setDescription(
          "Explique pourquoi ce message ne devait pas être bloqué.",
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(REASON_LENGTH),
        ),
    );
}

function parseReason(value) {
  const reason = String(value ?? "").trim();
  return reason === "" ? null : reason.slice(0, REASON_LENGTH);
}

function reviewTarget(container) {
  const buttons = container.components
    .filter((part) => part.type === ComponentType.ActionRow)
    .flatMap((row) => row.components)
    .map((button) => parseCustomId(button.custom_id).params);
  const remove = buttons.find((params) => params[0] === "remove");
  const timeout = buttons.find((params) => params[0] === "timeout");
  return {
    userId: timeout?.[1] ?? null,
    warningId: remove?.[2] ?? null,
  };
}

function reviewRow({ userId, warningId }) {
  const button = (action, label, style, ...params) =>
    new ButtonBuilder()
      .setCustomId(buildCustomId(ACTION_ID, action, ...params))
      .setLabel(label)
      .setStyle(style);
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    button(
      "accept",
      "Accepter",
      ButtonStyle.Success,
      userId,
      warningId ?? NO_WARNING,
    ),
    button("refuse", "Refuser", ButtonStyle.Secondary, userId),
    button("ban", "Bannir", ButtonStyle.Danger, userId),
  );
}

function contestedPayload(
  container,
  { reason, date = Date.now(), channelId = null },
) {
  const target = reviewTarget(container);
  const parts = container.components.filter(
    (part) => part.type !== ComponentType.ActionRow,
  );
  const title = parts.findIndex(
    (part) => part.type === ComponentType.TextDisplay,
  );
  parts[title] = {
    ...parts[title],
    content: parts[title].content.replace("Message bloqué", "Blocage contesté"),
  };

  const place = channelId === null ? "" : `\n**Salon :** <#${channelId}>`;
  const footer = parts
    .map((part) => part.type)
    .lastIndexOf(ComponentType.TextDisplay);
  const quote =
    reason === null
      ? "Aucun motif donné."
      : reason
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
  parts.splice(
    footer,
    0,
    new TextDisplayBuilder()
      .setContent(
        `**Contesté le :** <t:${Math.floor(date / 1000)}:f>${place}\n**Motif :**\n${quote}`,
      )
      .toJSON(),
    new SeparatorBuilder().toJSON(),
  );
  if (target.userId !== null && channelId === null)
    parts.push(reviewRow(target).toJSON());

  return {
    components: [
      { ...container, accent_color: CONTEST_COLOR, components: parts },
    ],
    flags: /** @type {MessageFlags.IsComponentsV2} */ (
      MessageFlags.IsComponentsV2
    ),
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  CONTEST_ID,
  CONTEST_COLOR,
  REASON_LENGTH,
  NO_WARNING,
  contestRow,
  reviewTarget,
  reviewRow,
  contestCheck,
  contestClosed,
  renderContestModal,
  parseReason,
  contestedPayload,
};
