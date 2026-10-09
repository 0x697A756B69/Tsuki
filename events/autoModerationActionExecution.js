const { AutoModerationActionType } = require("discord.js");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  getRuleKey,
  addAutomodWarning,
  warningNotice,
  getEscalation,
  escalationNotice,
} = require("../utils/automodWarnings");

module.exports = async (bot, execution) => {
  if (execution.action.type !== AutoModerationActionType.BlockMessage) return;

  const rule =
    execution.autoModerationRule ??
    (await execution.guild.autoModerationRules
      .fetch(execution.ruleId)
      .catch(() => null));
  const ruleKey =
    rule?.creatorId === bot.user.id ? getRuleKey(rule.name) : null;
  if (ruleKey === null) return;

  const warning = addAutomodWarning(bot.db, {
    id: await bot.utils.createId("WARN"),
    guildId: execution.guild.id,
    userId: execution.userId,
    botId: bot.user.id,
    ruleKey,
  });

  const escalation = getEscalation(
    getAutomodSettings(bot.db, execution.guild.id),
    warning.total,
  );
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
