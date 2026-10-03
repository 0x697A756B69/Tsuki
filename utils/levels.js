function xpToNextLevel(level) {
  return 5 * level ** 2 + 50 * level + 100;
}

function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpToNextLevel(i);
  return total;
}

function getLevelProgress(totalXp) {
  let level = 0;
  let remaining = Math.max(0, totalXp);
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level++;
  }
  return { level, current: remaining, required: xpToNextLevel(level) };
}

module.exports = { xpToNextLevel, totalXpForLevel, getLevelProgress };
