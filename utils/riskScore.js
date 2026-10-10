const { getTotalXp } = require("./xp");
const { getLevelProgress } = require("./levels");

const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 30 * DAY;
const NEW_MEMBER_DAYS = 7;
const OLD_MEMBER_DAYS = 90;
const TRUSTED_LEVEL = 10;
const NEW_MEMBER_TRUST = 1.5;
const TRUSTED_TRUST = 0.5;

const POINTS_KEYS = {
  words: "pointsWords",
  spam: "pointsSpam",
  mentions: "pointsMentions",
};

function trustFactor({ joinedAt = null, level = 0, now = Date.now() }) {
  const age = joinedAt === null ? null : now - joinedAt;
  if (age !== null && age < NEW_MEMBER_DAYS * DAY) return NEW_MEMBER_TRUST;
  if ((age !== null && age > OLD_MEMBER_DAYS * DAY) || level >= TRUSTED_LEVEL)
    return TRUSTED_TRUST;
  return 1;
}

function rulePoints(settings, ruleKey) {
  if (!(ruleKey in POINTS_KEYS))
    throw new TypeError(`Unknown rule: ${ruleKey}`);
  return settings[POINTS_KEYS[ruleKey]];
}

function infractionRisk({
  settings,
  ruleKey,
  joinedAt = null,
  level = 0,
  now = Date.now(),
}) {
  return {
    points: rulePoints(settings, ruleKey),
    trust: trustFactor({ joinedAt, level, now }),
  };
}

function formatNumber(value) {
  return String(value).replace(".", ",");
}

function getRiskScore(
  db,
  { guildId, userId, halfLifeDays, extra = 0, now = Date.now() },
) {
  const rows = db
    .prepare(
      "SELECT points, trust, created_at FROM automod_logs WHERE guild = ? AND user_id = ? AND points IS NOT NULL AND created_at > ?",
    )
    .all(guildId, userId, now - WINDOW);
  const halfLife = halfLifeDays * DAY;
  const score = rows.reduce(
    (total, row) =>
      total +
      Number(row.points) *
        Number(row.trust) *
        0.5 ** (Math.max(0, now - Number(row.created_at)) / halfLife),
    extra,
  );
  return Math.round(score * 100) / 100;
}

function escalationFor(settings, score) {
  if (settings.sensitivity === 0 || score < settings.sensitivity) return null;
  return {
    minutes: settings.escalationMinutes,
    reason: `AutoMod : score de risque ${formatNumber(score)}`,
  };
}

function getMemberLevel(db, guildId, userId) {
  return getLevelProgress(getTotalXp(db, guildId, userId)).level;
}

module.exports = {
  NEW_MEMBER_TRUST,
  TRUSTED_TRUST,
  trustFactor,
  rulePoints,
  infractionRisk,
  formatNumber,
  getRiskScore,
  escalationFor,
  getMemberLevel,
};
