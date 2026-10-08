const { totalXpForLevel } = require("./levels");

const FASTEST_MESSAGE_INTERVAL = 15;

function xpPerMinute({ xpMin, xpMax, cooldown }) {
  const average = (xpMin + xpMax) / 2;
  const gainsPerMinute = 60 / Math.max(cooldown, FASTEST_MESSAGE_INTERVAL);
  return average * gainsPerMinute;
}

function minutesToLevel(settings, level) {
  const speed = xpPerMinute(settings);
  return speed === 0 ? Infinity : totalXpForLevel(level) / speed;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "jamais";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (24 * 60))} j`;
}

module.exports = { xpPerMinute, minutesToLevel, formatDuration };
