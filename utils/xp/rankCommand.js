const { getLevelProgress } = require("./levels");
const { getTypeXp, getBreakdown, getRank } = require("./xp");

const RANK_TYPES = {
  global: { label: null, xpLabel: "XP au total", noXp: "d'XP" },
  messages: {
    label: "Messages",
    xpLabel: "XP de messages",
    noXp: "d'XP de messages",
  },
  voice: { label: "Vocal", xpLabel: "XP vocal", noXp: "d'XP vocale" },
};

function getRankType(type) {
  const rankType = RANK_TYPES[type];
  if (!rankType) throw new RangeError(`Unknown rank type: ${type}`);
  return rankType;
}

function getRankCardData(db, guildId, userId, type = "global") {
  const { label, xpLabel } = getRankType(type);
  const rank = getRank(db, guildId, userId, type);
  if (!rank) return null;
  const totalXp = getTypeXp(db, guildId, userId, type);
  return {
    ...getLevelProgress(totalXp),
    totalXp,
    ...rank,
    label,
    xpLabel,
    breakdown: type === "global" ? getBreakdown(db, guildId, userId) : null,
  };
}

function formatNoXp(member, isSelf, type = "global") {
  const { noXp } = getRankType(type);
  if (isSelf) return `Tu n'as pas encore ${noXp}.`;
  return `${member} n'a pas encore ${noXp}.`;
}

function getCardColors(accent) {
  return accent ? [accent, "#ffffff"] : undefined;
}

module.exports = {
  RANK_TYPES,
  getRankCardData,
  formatNoXp,
  getCardColors,
};
