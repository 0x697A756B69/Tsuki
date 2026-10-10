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

function addLog(
  db,
  { guildId, channelId, messageId, userId = null, date = Date.now() },
) {
  db.prepare(
    "INSERT INTO automod_logs (guild, channel, message, created_at, user_id) VALUES (?, ?, ?, ?, ?)",
  ).run(guildId, channelId, messageId, date, userId);
}

function getLog(db, { guildId, channelId, messageId }) {
  const row = db
    .prepare(
      "SELECT * FROM automod_logs WHERE guild = ? AND channel = ? AND message = ?",
    )
    .get(guildId, channelId, messageId);
  if (!row) return null;
  return {
    userId: row.user_id === null ? null : String(row.user_id),
    createdAt: Number(row.created_at),
    contestedAt: row.contested_at === null ? null : Number(row.contested_at),
    contestStatus:
      row.contest_status === null ? null : String(row.contest_status),
    contestChannel:
      row.contest_channel === null ? null : String(row.contest_channel),
    judgedBy: row.judged_by === null ? null : String(row.judged_by),
    judgedAt: row.judged_at === null ? null : Number(row.judged_at),
  };
}

function getLogByContestChannel(db, guildId, contestChannelId) {
  const row = db
    .prepare(
      "SELECT channel, message FROM automod_logs WHERE guild = ? AND contest_channel = ?",
    )
    .get(guildId, contestChannelId);
  if (!row) return null;
  const ref = {
    guildId,
    channelId: String(row.channel),
    messageId: String(row.message),
  };
  return { ref, ...getLog(db, ref) };
}

function setJudged(
  db,
  { guildId, channelId, messageId },
  moderatorId,
  date = Date.now(),
) {
  const result = db
    .prepare(
      "UPDATE automod_logs SET judged_by = ?, judged_at = ? WHERE guild = ? AND channel = ? AND message = ? AND judged_at IS NULL",
    )
    .run(moderatorId, date, guildId, channelId, messageId);
  return Number(result.changes) > 0;
}

function clearContestChannel(db, { guildId, channelId, messageId }) {
  db.prepare(
    "UPDATE automod_logs SET contest_channel = NULL WHERE guild = ? AND channel = ? AND message = ?",
  ).run(guildId, channelId, messageId);
}

function setContestStatus(db, { guildId, channelId, messageId }, status) {
  const result = db
    .prepare(
      "UPDATE automod_logs SET contest_status = ? WHERE guild = ? AND channel = ? AND message = ? AND contest_status = 'pending'",
    )
    .run(status, guildId, channelId, messageId);
  return Number(result.changes) > 0;
}

function markContested(
  db,
  { guildId, channelId, messageId },
  date = Date.now(),
) {
  const result = db
    .prepare(
      "UPDATE automod_logs SET contested_at = ?, contest_status = 'pending' WHERE guild = ? AND channel = ? AND message = ? AND contested_at IS NULL",
    )
    .run(date, guildId, channelId, messageId);
  return Number(result.changes) > 0;
}

function setContestChannel(
  db,
  { guildId, channelId, messageId },
  contestChannelId,
) {
  db.prepare(
    "UPDATE automod_logs SET contest_channel = ? WHERE guild = ? AND channel = ? AND message = ?",
  ).run(contestChannelId, guildId, channelId, messageId);
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
    userId: data.userId,
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
  markResolved,
  addLog,
  getLog,
  markContested,
  setContestStatus,
  setContestChannel,
  getLogByContestChannel,
  setJudged,
  clearContestChannel,
  resolvedNotice,
  getExpiredLogs,
  deleteLog,
  sendLog,
  purgeLogs,
};
