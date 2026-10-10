const { RULE_NAMES } = require("./automodRules");

const RULE_LABELS = {
  words: "mot interdit",
  spam: "spam",
  mentions: "mentions de masse",
};

const REASON_KEYS = {
  words: "reasonWords",
  spam: "reasonSpam",
  mentions: "reasonMentions",
};

function getRuleKey(ruleName) {
  const entry = Object.entries(RULE_NAMES).find(
    ([, name]) => name === ruleName,
  );
  return entry ? entry[0] : null;
}

function ruleReason(settings, ruleKey) {
  if (!(ruleKey in REASON_KEYS))
    throw new TypeError(`Unknown rule: ${ruleKey}`);
  return settings[REASON_KEYS[ruleKey]];
}

module.exports = { RULE_LABELS, getRuleKey, ruleReason };
