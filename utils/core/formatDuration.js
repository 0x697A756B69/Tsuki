function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "jamais";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (24 * 60))} j`;
}

module.exports = { formatDuration };
