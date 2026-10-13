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

module.exports = { xpPerMinute, minutesToLevel };
