const { AutoModerationActionType } = require("discord.js");
const { getAutomodSettings } = require("../utils/automodSettings");
const { getRuleKey, ruleReason } = require("../utils/automodWarnings");
const { sendLog } = require("../utils/automodLogs");
const { contestRow } = require("../utils/automodContest");
const { registerWarning, enforceWarning } = require("../utils/warnSanction");
const { announceClosedDm } = require("../utils/moderationNotice");

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

  const member = await execution.guild.members
    .fetch(execution.userId)
    .catch(() => null);
  const user = await bot.users.fetch(execution.userId).catch(() => null);

  const warning = registerWarning(bot.db, {
    id: await bot.utils.createId("WARN"),
    guildId: execution.guild.id,
    userId: execution.userId,
    authorId: bot.user.id,
    reason: ruleReason(settings, ruleKey),
  });

  const log = await sendLog(bot, execution.guild, settings.logChannel, {
    ruleKey,
    ruleName: rule.name,
    userId: execution.userId,
    channelId: execution.channelId,
    warningTotal: warning.count,
    warningId: warning.id,
    content: execution.matchedContent ?? execution.content,
    messageUrl: execution.messageId
      ? `https://discord.com/channels/${execution.guild.id}/${execution.channelId}/${execution.messageId}`
      : null,
  });

  const canContest = settings.contestHours > 0 && log !== null;
  const { delivered } = await enforceWarning({
    db: bot.db,
    guild: execution.guild,
    user,
    member,
    warning,
    components: canContest
      ? [
          contestRow({
            guildId: execution.guild.id,
            channelId: settings.logChannel,
            messageId: log.id,
          }),
        ]
      : [],
  });
  if (!delivered)
    announceClosedDm(
      execution.guild.channels.cache.get(execution.channelId),
      execution.userId,
    ).catch(() => {});
};
