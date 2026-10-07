const { getLevelProgress } = require("./levels");
const { getTotalXp, getRank } = require("./xp");

function getRankCardData(db, guildId, userId) {
  const rank = getRank(db, guildId, userId);
  if (!rank) return null;
  const totalXp = getTotalXp(db, guildId, userId);
  return { ...getLevelProgress(totalXp), totalXp, ...rank };
}

function formatNoXp(member, isSelf) {
  if (isSelf) return "Tu n'as pas encore d'XP.";
  return `${member} n'a pas encore d'XP.`;
}

function getCardColors(accent) {
  return accent ? [accent, "#ffffff"] : undefined;
}

module.exports = { getRankCardData, formatNoXp, getCardColors };
