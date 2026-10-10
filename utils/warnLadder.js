const transaction = require("./transaction");

const DAY = 24 * 60 * 60 * 1000;
const MAX_STEPS = 10;
const MAX_MINUTES = 40320;
const SANCTIONS = ["timeout", "kick", "ban"];

const DEFAULT_LADDER = [
  { warns: 1, sanction: null, minutes: null },
  { warns: 2, sanction: "timeout", minutes: 10 },
  { warns: 3, sanction: "timeout", minutes: 60 },
  { warns: 4, sanction: "timeout", minutes: 1440 },
];

function validateLadder(steps) {
  if (steps.length === 0 || steps.length > MAX_STEPS)
    throw new RangeError(`A ladder has 1 to ${MAX_STEPS} steps`);

  steps.forEach((step, index) => {
    if (step.warns !== index + 1)
      throw new RangeError("Steps must follow 1, 2, 3...");
    if (step.sanction !== null && !SANCTIONS.includes(step.sanction))
      throw new TypeError(`Unknown sanction: ${step.sanction}`);
    if (step.sanction === "timeout") {
      if (
        !Number.isInteger(step.minutes) ||
        step.minutes < 1 ||
        step.minutes > MAX_MINUTES
      )
        throw new RangeError("A timeout lasts 1 to 40320 minutes");
    } else if (step.minutes !== null) {
      throw new TypeError("Only a timeout has a duration");
    }
  });
}

function getLadder(db, guildId) {
  const rows = db
    .prepare(
      "SELECT warns, sanction, minutes FROM warn_ladder WHERE guild = ? ORDER BY warns",
    )
    .all(guildId);
  if (rows.length === 0) return DEFAULT_LADDER.map((step) => ({ ...step }));
  return rows.map((row) => ({
    warns: Number(row.warns),
    sanction: row.sanction === null ? null : String(row.sanction),
    minutes: row.minutes === null ? null : Number(row.minutes),
  }));
}

function setLadder(db, guildId, steps) {
  validateLadder(steps);
  transaction(db, () => {
    db.prepare("DELETE FROM warn_ladder WHERE guild = ?").run(guildId);
    const insert = db.prepare(
      "INSERT INTO warn_ladder (guild, warns, sanction, minutes) VALUES (?, ?, ?, ?)",
    );
    for (const step of steps)
      insert.run(guildId, step.warns, step.sanction, step.minutes);
  });
  return getLadder(db, guildId);
}

function resetLadder(db, guildId) {
  db.prepare("DELETE FROM warn_ladder WHERE guild = ?").run(guildId);
  return getLadder(db, guildId);
}

function stepFor(ladder, count) {
  if (count < 1) return null;
  return ladder.filter((step) => step.warns <= count).at(-1) ?? null;
}

function nextSanction(ladder, count) {
  return (
    ladder.find((step) => step.warns > count && step.sanction !== null) ?? null
  );
}

function isActive(date, validDays, now = Date.now()) {
  return validDays === 0 || date > now - validDays * DAY;
}

function countActiveWarnings(db, guildId, userId, validDays, now = Date.now()) {
  const rows = db
    .prepare("SELECT date FROM warns WHERE guild = ? AND user = ?")
    .all(guildId, userId);
  return rows.filter((row) => isActive(Number(row.date), validDays, now))
    .length;
}

function expiresAt(date, validDays) {
  return validDays === 0 ? null : date + validDays * DAY;
}

function formatDuration(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} j`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

function describeStep(step) {
  if (step.sanction === null) return "aucune sanction";
  if (step.sanction === "timeout")
    return `sourdine de ${formatDuration(step.minutes)}`;
  return step.sanction === "kick" ? "expulsion" : "bannissement";
}

module.exports = {
  DEFAULT_LADDER,
  MAX_STEPS,
  MAX_MINUTES,
  validateLadder,
  getLadder,
  setLadder,
  resetLadder,
  stepFor,
  nextSanction,
  isActive,
  countActiveWarnings,
  expiresAt,
  formatDuration,
  describeStep,
};
