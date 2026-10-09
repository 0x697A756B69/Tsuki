const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
} = require("discord.js");

const RULE_NAMES = {
  words: "Tsuki - Mots interdits",
  spam: "Tsuki - Spam",
  mentions: "Tsuki - Mentions",
};
const BLOCK_MESSAGE = "Ce message a été bloqué par l'AutoMod de Tsuki.";
const MAX_WORDS = 1000;
const MAX_EXEMPT_ROLES = 20;
const MAX_EXEMPT_CHANNELS = 50;

function cleanWords(words) {
  const cleaned = words.map((word) => word.trim().toLowerCase());
  return [...new Set(cleaned.filter(Boolean))].slice(0, MAX_WORDS);
}

function buildRules(config) {
  const block = {
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage: BLOCK_MESSAGE },
  };
  const alert =
    config.logChannel === null
      ? []
      : [
          {
            type: AutoModerationActionType.SendAlertMessage,
            metadata: { channel: config.logChannel },
          },
        ];

  const base = {
    eventType: AutoModerationRuleEventType.MessageSend,
    actions: [block, ...alert],
    enabled: true,
    exemptRoles: config.exemptRoles.slice(0, MAX_EXEMPT_ROLES),
    exemptChannels: config.exemptChannels.slice(0, MAX_EXEMPT_CHANNELS),
  };

  const rules = [];
  const words = cleanWords(config.words);
  if (words.length > 0)
    rules.push({
      ...base,
      key: "words",
      name: RULE_NAMES.words,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: words },
    });
  if (config.spam)
    rules.push({
      ...base,
      key: "spam",
      name: RULE_NAMES.spam,
      triggerType: AutoModerationRuleTriggerType.Spam,
      triggerMetadata: {},
    });
  if (config.mentions)
    rules.push({
      ...base,
      key: "mentions",
      name: RULE_NAMES.mentions,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: {
        mentionTotalLimit: config.mentionLimit,
        mentionRaidProtectionEnabled: true,
      },
    });
  return rules;
}

async function syncRules(guild, config, reason) {
  const existing = [...(await guild.autoModerationRules.fetch()).values()];
  const owned = (name) =>
    existing.find(
      (rule) => rule.name === name && rule.creatorId === guild.client.user.id,
    );
  const result = { created: [], updated: [], deleted: [] };
  const wanted = buildRules(config);

  for (const { key, ...rule } of wanted) {
    const found = owned(rule.name);
    if (found) {
      await found.edit({ ...rule, reason });
      result.updated.push(key);
    } else {
      await guild.autoModerationRules.create({ ...rule, reason });
      result.created.push(key);
    }
  }

  for (const [key, name] of Object.entries(RULE_NAMES)) {
    const found = owned(name);
    if (found && !wanted.some((rule) => rule.key === key)) {
      await found.delete(reason);
      result.deleted.push(key);
    }
  }
  return result;
}

module.exports = { RULE_NAMES, buildRules, syncRules };
