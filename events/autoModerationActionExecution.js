const { AutoModerationActionType } = require("discord.js");
const {
  getRuleKey,
  addAutomodWarning,
  warningNotice,
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

  const user = await bot.users.fetch(execution.userId).catch(() => null);
  await user
    ?.send(warningNotice(execution.guild.name, warning.reason))
    .catch(() => {});
};
