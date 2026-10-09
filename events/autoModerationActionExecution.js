const { AutoModerationActionType } = require("discord.js");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  getRuleKey,
  addAutomodWarning,
  blockedNotice,
  getEscalation,
  escalationNotice,
} = require("../utils/automodWarnings");
const { sendLog, setLogTimeout } = require("../utils/automodLogs");
const { contestRow } = require("../utils/automodContest");
const { infractionRisk, getMemberLevel } = require("../utils/riskScore");

module.exports = async (bot, execution) => {
  const rule =
    execution.autoModerationRule ??
    (await execution.guild.autoModerationRules
      .fetch(execution.ruleId)
      .catch(() => null));
  const ruleKey =
    rule?.creatorId === bot.user.id ? getRuleKey(rule.name) : null;
  if (ruleKey === null) return;

  const settings = getAutomodSettings(bot.db, execution.guild.id);

  if (execution.action.type === AutoModerationActionType.SendAlertMessage) {
    if (settings.logChannel === null) return;
    if (settings.observation)
      await sendLog(bot, execution.guild, settings.logChannel, {
        ruleKey,
        ruleName: rule.name,
        userId: execution.userId,
        channelId: execution.channelId,
        content: execution.matchedContent ?? execution.content,
        messageUrl: execution.messageId
          ? `https://discord.com/channels/${execution.guild.id}/${execution.channelId}/${execution.messageId}`
          : null,
        messageId: execution.messageId,
        observed: true,
      });
    if (!execution.alertSystemMessageId) return;
    const channel = execution.guild.channels.cache.get(settings.logChannel);
    await channel?.messages
      ?.delete(execution.alertSystemMessageId)
      .catch(() => {});
    return;
  }

  if (execution.action.type !== AutoModerationActionType.BlockMessage) return;

  const warning = addAutomodWarning(bot.db, {
    id: await bot.utils.createId("WARN"),
    guildId: execution.guild.id,
    userId: execution.userId,
    botId: bot.user.id,
    ruleKey,
  });

  const member = await execution.guild.members
    .fetch(execution.userId)
    .catch(() => null);
  const risk = infractionRisk({
    settings,
    ruleKey,
    joinedAt: member?.joinedTimestamp ?? null,
    level: getMemberLevel(bot.db, execution.guild.id, execution.userId),
  });

  const log = await sendLog(bot, execution.guild, settings.logChannel, {
    ...risk,
    ruleKey,
    ruleName: rule.name,
    userId: execution.userId,
    channelId: execution.channelId,
    warningTotal: warning.total,
    warningId: warning.id,
    content: execution.matchedContent ?? execution.content,
    messageUrl: execution.messageId
      ? `https://discord.com/channels/${execution.guild.id}/${execution.channelId}/${execution.messageId}`
      : null,
  });

  const escalation = getEscalation(settings, warning.total);
  const timedOutMember =
    escalation && member?.moderatable === true
      ? await member
          .timeout(escalation.minutes * 60 * 1000, escalation.reason)
          .catch(() => null)
      : null;
  const timedOut = timedOutMember !== null;
  if (timedOut && log !== null)
    setLogTimeout(
      bot.db,
      {
        guildId: execution.guild.id,
        channelId: settings.logChannel,
        messageId: log.id,
      },
      timedOutMember?.communicationDisabledUntilTimestamp ?? null,
    );

  const user = await bot.users.fetch(execution.userId).catch(() => null);
  const canContest = settings.contestHours > 0 && log !== null;
  await user
    ?.send({
      content: blockedNotice(
        execution.guild.name,
        ruleKey,
        warning.total,
        settings,
      ),
      components: canContest
        ? [
            contestRow({
              guildId: execution.guild.id,
              channelId: settings.logChannel,
              messageId: log.id,
            }),
          ]
        : [],
    })
    .catch(() => {});
  if (timedOut)
    await user
      ?.send(escalationNotice(execution.guild.name, escalation.minutes))
      .catch(() => {});
};
