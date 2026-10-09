const { getTotalXp } = require("./xp");
const { getLevelProgress } = require("./levels");

const DAY = 24 * 60 * 60 * 1000;
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

function getMemberLevel(db, guildId, userId) {
  return getLevelProgress(getTotalXp(db, guildId, userId)).level;
}

module.exports = {
  NEW_MEMBER_TRUST,
  TRUSTED_TRUST,
  trustFactor,
  rulePoints,
  infractionRisk,
  getMemberLevel,
};
