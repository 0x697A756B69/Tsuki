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
const { buildCustomId } = require("./customId");

const CONTEST_ID = "automod-contest";
const CONTEST_COLOR = 0x8b5cf6;
const REASON_LENGTH = 300;
const HOUR = 60 * 60 * 1000;

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

function contestedPayload(container, { reason, date = Date.now() }) {
  const parts = [...container.components];
  const title = parts.findIndex(
    (part) => part.type === ComponentType.TextDisplay,
  );
  parts[title] = {
    ...parts[title],
    content: parts[title].content.replace("Message bloqué", "Blocage contesté"),
  };

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
        `**Contesté le :** <t:${Math.floor(date / 1000)}:f>\n**Motif :**\n${quote}`,
      )
      .toJSON(),
    new SeparatorBuilder().toJSON(),
  );

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
  contestRow,
  contestCheck,
  renderContestModal,
  parseReason,
  contestedPayload,
};
