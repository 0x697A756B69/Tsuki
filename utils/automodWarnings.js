const { RULE_NAMES } = require("./automodRules");

const RULE_LABELS = {
  words: "mot interdit",
  spam: "spam",
  mentions: "mentions de masse",
};

function getRuleKey(ruleName) {
  const entry = Object.entries(RULE_NAMES).find(
    ([, name]) => name === ruleName,
  );
  return entry ? entry[0] : null;
}

function warningReason(ruleKey) {
  return `AutoMod : ${RULE_LABELS[ruleKey]}`;
}

function countWarnings(db, guildId, userId) {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM warns WHERE guild = ? AND user = ?")
    .get(guildId, userId);
  return Number(row.total);
}

function addAutomodWarning(
  db,
  { id, guildId, userId, botId, ruleKey, date = Date.now() },
) {
  if (!(ruleKey in RULE_LABELS))
    throw new TypeError(`Unknown rule: ${ruleKey}`);

  const reason = warningReason(ruleKey);
  db.prepare(
    "INSERT INTO warns (id, guild, user, author, reason, date) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, guildId, userId, botId, reason, date);
  return { id, reason, total: countWarnings(db, guildId, userId) };
}

function warningNotice(guildName, reason) {
  return `Tu as reçu un avertissement automatique sur ${guildName}.\n> **Raison :** \`${reason}\``;
}

function getEscalation(settings, total) {
  if (settings.escalationWarns === 0 || total < settings.escalationWarns)
    return null;
  return {
    minutes: settings.escalationMinutes,
    reason: `AutoMod : ${total} avertissements`,
  };
}

function escalationNotice(guildName, minutes) {
  return `Tu as été mis en sourdine ${minutes} minute${minutes > 1 ? "s" : ""} sur ${guildName} après plusieurs avertissements.`;
}

module.exports = {
  getEscalation,
  escalationNotice,
  getRuleKey,
  warningReason,
  countWarnings,
  addAutomodWarning,
  warningNotice,
};
