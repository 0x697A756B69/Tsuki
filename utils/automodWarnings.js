const { RULE_NAMES } = require("./automodRules");
const { formatNumber } = require("./riskScore");

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

function blockedNotice(guildName, ruleKey, { total, score }, settings) {
  const left = settings.sensitivity > 0 && score < settings.sensitivity;
  const minutes = settings.escalationMinutes;
  const risk = left
    ? `${formatNumber(score)} sur ${settings.sensitivity}, à ${settings.sensitivity}, tu seras mis en sourdine ${minutes} minute${minutes > 1 ? "s" : ""}.`
    : `${formatNumber(score)}.`;
  return `Ton message a été bloqué sur ${guildName}.
**Règle :** ${RULE_LABELS[ruleKey]}
**Avertissements :** ${total}.
**Score :** ${risk}`;
}

function escalationNotice(guildName, minutes) {
  return `Tu as été mis en sourdine ${minutes} minute${minutes > 1 ? "s" : ""} sur ${guildName} : ton score de risque est trop élevé.`;
}

module.exports = {
  RULE_LABELS,
  escalationNotice,
  getRuleKey,
  warningReason,
  countWarnings,
  addAutomodWarning,
  blockedNotice,
};
