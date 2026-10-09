const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { RULE_LABELS } = require("./automodWarnings");
const { buildCustomId } = require("./customId");

const BLOCKED_COLOR = 0xe5484d;
const OBSERVED_COLOR = 0xf5a524;
const RESOLVED_COLOR = 0x8e8e93;
const ACTION_ID = "automod-action";
const EXCERPT_LENGTH = 200;
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 100;

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
        actionButton("timeout", "Mettre en sourdine", [userId]),
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
        `**Règle :** ${ruleName}\n**Action :** ${observed ? "observation, aucune sanction" : `bloqué, avertissement ajouté (${warningTotal} au total)`}`,
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

function addLog(db, { guildId, channelId, messageId, date = Date.now() }) {
  db.prepare(
    "INSERT INTO automod_logs (guild, channel, message, created_at) VALUES (?, ?, ?, ?)",
  ).run(guildId, channelId, messageId, date);
}

function getExpiredLogs(db, now = Date.now(), limit = PURGE_BATCH) {
  return db
    .prepare(
      "SELECT guild, channel, message FROM automod_logs WHERE created_at <= ? ORDER BY created_at LIMIT ?",
    )
    .all(now - RETENTION, limit)
    .map((row) => ({
      guildId: String(row.guild),
      channelId: String(row.channel),
      messageId: String(row.message),
    }));
}

function deleteLog(db, { guildId, channelId, messageId }) {
  db.prepare(
    "DELETE FROM automod_logs WHERE guild = ? AND channel = ? AND message = ?",
  ).run(guildId, channelId, messageId);
}

async function sendLog(bot, guild, logChannelId, data) {
  if (logChannelId === null) return null;
  const channel = guild.channels.cache.get(logChannelId);
  if (!channel?.isTextBased()) return null;

  const message = await channel.send(buildLogMessage(data)).catch(() => null);
  if (message === null) return null;

  addLog(bot.db, {
    guildId: guild.id,
    channelId: channel.id,
    messageId: message.id,
    date: data.date,
  });
  return message;
}

async function purgeLogs(bot, now = Date.now()) {
  const expired = getExpiredLogs(bot.db, now);
  for (const log of expired) {
    const channel = await bot.channels.fetch(log.channelId).catch(() => null);
    await channel?.messages?.delete(log.messageId).catch(() => {});
    deleteLog(bot.db, log);
  }
  return expired.length;
}

module.exports = {
  ACTION_ID,
  EXCERPT_LENGTH,
  RETENTION,
  logTitle,
  excerpt,
  buildLogMessage,
  addLog,
  getExpiredLogs,
  deleteLog,
  sendLog,
  purgeLogs,
};
