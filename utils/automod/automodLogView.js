const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { RULE_LABELS } = require("./automodWarnings");
const { buildCustomId } = require("../core/customId");

const BLOCKED_COLOR = 0xe5484d;
const OBSERVED_COLOR = 0xf5a524;
const RESOLVED_COLOR = 0x8e8e93;
const ACTION_ID = "automod-action";
const EXCERPT_LENGTH = 200;
const RETENTION = 30 * 24 * 60 * 60 * 1000;

function logTitle(ruleKey, observed = false) {
  return `${observed ? "Message détecté" : "Message bloqué"} : ${RULE_LABELS[ruleKey]}`;
}

function excerpt(content) {
  const flat = String(content ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat === "") return null;
  return flat.length > EXCERPT_LENGTH
    ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…`
    : flat;
}

function purgeDate(date) {
  return Math.floor((date + RETENTION) / 1000);
}

function actionButton(
  action,
  label,
  params = [],
  style = ButtonStyle.Secondary,
) {
  return new ButtonBuilder()
    .setCustomId(buildCustomId(ACTION_ID, action, ...params))
    .setLabel(label)
    .setStyle(style);
}

function buildActionRow({ userId, channelId, warningId, messageId, observed }) {
  const buttons = observed
    ? [
        ...(messageId
          ? [
              actionButton("delete", "Supprimer le message", [
                channelId,
                messageId,
              ]),
            ]
          : []),
        actionButton("warn", "Avertir", [userId]),
      ]
    : [
        ...(warningId
          ? [
              actionButton("remove", "Retirer l'avertissement", [
                userId,
                warningId,
              ]),
            ]
          : []),
        actionButton("timeout", "Mettre en sourdine", [
          userId,
          ...(warningId ? [warningId] : []),
        ]),
        actionButton("ban", "Bannir", [userId], ButtonStyle.Danger),
      ];
  buttons.push(actionButton("close", "Classer"));
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(buttons);
}

function resolvedNotice({ moderatorId, label, date }) {
  return `Traité par <@${moderatorId}> : ${label}, le <t:${Math.floor(date / 1000)}:f>`;
}

function buildLogMessage({
  ruleKey,
  ruleName,
  userId,
  channelId,
  warningTotal = 0,
  content,
  messageUrl = null,
  warningId = null,
  messageId = null,
  resolved = null,
  observed = false,
  date = Date.now(),
}) {
  const text = (value) => new TextDisplayBuilder().setContent(value);
  const quote = excerpt(content);

  const container = new ContainerBuilder()
    .setAccentColor(
      resolved ? RESOLVED_COLOR : observed ? OBSERVED_COLOR : BLOCKED_COLOR,
    )
    .addTextDisplayComponents(text(`## ${logTitle(ruleKey, observed)}`))
    .addTextDisplayComponents(
      text(`**Membre :** <@${userId}>\n**Salon :** <#${channelId}>`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        `**Règle :** ${ruleName}\n**Action :** ${observed ? "observation, aucune sanction" : `bloqué, avertissement ajouté (${warningTotal} actif${warningTotal > 1 ? "s" : ""})`}`,
      ),
    );

  if (messageUrl !== null || quote !== null) {
    const lines = [];
    if (messageUrl !== null)
      lines.push(`**Message :** [Aller au message](${messageUrl})`);
    if (quote !== null) lines.push(`> ${quote}`);
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(text(lines.join("\n")));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        `-# ${resolved ? `${resolvedNotice(resolved)} · ` : ""}Supprimé de ce salon le <t:${purgeDate(date)}:D>`,
      ),
    );

  if (!resolved)
    container.addActionRowComponents(
      buildActionRow({ userId, channelId, warningId, messageId, observed }),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function markResolved(container, resolved) {
  const parts = container.components.filter(
    (part) => part.type !== ComponentType.ActionRow,
  );
  const last = parts.length - 1;
  return {
    components: [
      {
        ...container,
        accent_color: RESOLVED_COLOR,
        components: parts.map((part, index) =>
          index === last
            ? {
                ...part,
                content: `-# ${resolvedNotice(resolved)} · ${part.content.slice(3)}`,
              }
            : part,
        ),
      },
    ],
    flags: /** @type {MessageFlags.IsComponentsV2} */ (
      MessageFlags.IsComponentsV2
    ),
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  ACTION_ID,
  EXCERPT_LENGTH,
  RETENTION,
  logTitle,
  excerpt,
  buildLogMessage,
  markResolved,
  resolvedNotice,
};
