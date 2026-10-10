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
const BLOCK_MESSAGES = {
  words:
    "Ton message contient un mot interdit sur ce serveur. Un avertissement a été ajouté, relis les règles.",
  spam: "Ton message ressemble à du spam. Un avertissement a été ajouté, évite de répéter ou d'inonder le salon.",
  mentions:
    "Ton message contient trop de mentions. Un avertissement a été ajouté, mentionne moins de personnes à la fois.",
};
const MAX_WORDS = 1000;
const MAX_EXEMPT_ROLES = 20;
const MAX_EXEMPT_CHANNELS = 50;

function cleanWords(words) {
  const cleaned = words.map((word) => word.trim().toLowerCase());
  return [...new Set(cleaned.filter(Boolean))].slice(0, MAX_WORDS);
}

function blockAction(key) {
  return {
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage: BLOCK_MESSAGES[key] },
  };
}

function buildRules(config) {
  const observing = config.observation && config.logChannel !== null;
  const alert =
    config.logChannel === null
      ? []
      : [
          {
            type: AutoModerationActionType.SendAlertMessage,
            metadata: { channel: config.logChannel },
          },
        ];

  const actionsFor = (key) =>
    observing ? alert : [blockAction(key), ...alert];

  const base = {
    eventType: AutoModerationRuleEventType.MessageSend,
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
      actions: actionsFor("words"),
      name: RULE_NAMES.words,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: words },
    });
  if (config.spam)
    rules.push({
      ...base,
      key: "spam",
      actions: actionsFor("spam"),
      name: RULE_NAMES.spam,
      triggerType: AutoModerationRuleTriggerType.Spam,
      triggerMetadata: {},
    });
  if (config.mentions)
    rules.push({
      ...base,
      key: "mentions",
      actions: actionsFor("mentions"),
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

module.exports = { RULE_NAMES, BLOCK_MESSAGES, buildRules, syncRules };
