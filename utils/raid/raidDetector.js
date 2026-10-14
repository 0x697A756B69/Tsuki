const { isSuspect } = require("./joinSignals");

const MINUTE = 60 * 1000;
const TIERS = ["calm", "watch", "alert", "raid"];

function tierRank(tier) {
  return TIERS.indexOf(tier);
}

function countRecent(joins, settings, now) {
  const since = now - settings.windowMinutes * MINUTE;
  return joins.filter(
    (join) =>
      join.joinedAt >= since &&
      join.joinedAt <= now &&
      (settings.scope === "all" || isSuspect(join.signals)),
  ).length;
}

function rawTier(count, settings) {
  if (count >= settings.raidJoins) return "raid";
  if (count >= settings.alertJoins) return "alert";
  if (count >= settings.watchJoins) return "watch";
  return "calm";
}

function evaluateRaid({ joins, settings, previous = null, now }) {
  const count = countRecent(joins, settings, now);
  const raw = rawTier(count, settings);
  const before = previous ?? { tier: "calm", heldAt: now };

  if (tierRank(raw) >= tierRank(before.tier))
    return {
      tier: raw,
      count,
      heldAt: now,
      changed: raw !== before.tier,
    };

  if (now - before.heldAt < settings.calmMinutes * MINUTE)
    return { tier: before.tier, count, heldAt: before.heldAt, changed: false };

  return { tier: raw, count, heldAt: now, changed: true };
}

module.exports = {
  MINUTE,
  TIERS,
  countRecent,
  evaluateRaid,
  rawTier,
  tierRank,
};
