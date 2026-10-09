const { AutoModerationActionType } = require("discord.js");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  getRuleKey,
  addAutomodWarning,
  warningNotice,
  getEscalation,
  escalationNotice,
} = require("../utils/automodWarnings");
const { sendLog } = require("../utils/automodLogs");

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
    if (settings.logChannel === null || !execution.alertSystemMessageId) return;
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

  await sendLog(bot, execution.guild, settings.logChannel, {
    ruleKey,
    ruleName: rule.name,
    userId: execution.userId,
    channelId: execution.channelId,
    warningTotal: warning.total,
    content: execution.matchedContent ?? execution.content,
    messageUrl: execution.messageId
      ? `https://discord.com/channels/${execution.guild.id}/${execution.channelId}/${execution.messageId}`
      : null,
  });

  const escalation = getEscalation(settings, warning.total);
  const member = escalation
    ? await execution.guild.members.fetch(execution.userId).catch(() => null)
    : null;
  const timedOut =
    member?.moderatable === true &&
    (await member
      .timeout(escalation.minutes * 60 * 1000, escalation.reason)
      .then(() => true)
      .catch(() => false));

  const user = await bot.users.fetch(execution.userId).catch(() => null);
  await user
    ?.send(warningNotice(execution.guild.name, warning.reason))
    .catch(() => {});
  if (timedOut)
    await user
      ?.send(escalationNotice(execution.guild.name, escalation.minutes))
      .catch(() => {});
};
