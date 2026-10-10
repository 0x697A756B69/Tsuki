const transaction = require("./transaction");

const DEFAULT_REASONS = [
  "Insultes",
  "Spam",
  "Publicité",
  "Contenu inapproprié",
  "Harcèlement",
  "Mentions de masse",
];
const MAX_REASONS = 24;
const MAX_LENGTH = 50;

function cleanReasons(labels) {
  const seen = new Set();
  const cleaned = [];
  for (const label of labels.map((text) => text.trim())) {
    const key = label.toLowerCase();
    if (label === "" || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(label.slice(0, MAX_LENGTH));
  }
  return cleaned.slice(0, MAX_REASONS);
}

function getReasons(db, guildId) {
  const rows = db
    .prepare("SELECT label FROM warn_reasons WHERE guild = ? ORDER BY position")
    .all(guildId);
  return rows.length === 0
    ? [...DEFAULT_REASONS]
    : rows.map((row) => String(row.label));
}

function setReasons(db, guildId, labels) {
  const cleaned = cleanReasons(labels);
  if (cleaned.length === 0)
    throw new RangeError("At least one reason is required");

  transaction(db, () => {
    db.prepare("DELETE FROM warn_reasons WHERE guild = ?").run(guildId);
    const insert = db.prepare(
      "INSERT INTO warn_reasons (guild, position, label) VALUES (?, ?, ?)",
    );
    cleaned.forEach((label, position) => insert.run(guildId, position, label));
  });
  return cleaned;
}

function resetReasons(db, guildId) {
  db.prepare("DELETE FROM warn_reasons WHERE guild = ?").run(guildId);
  return [...DEFAULT_REASONS];
}

module.exports = {
  DEFAULT_REASONS,
  MAX_REASONS,
  cleanReasons,
  getReasons,
  setReasons,
  resetReasons,
};
