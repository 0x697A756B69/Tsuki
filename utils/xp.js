const { getLevelProgress } = require("./levels");
const transaction = require("./transaction");

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
});

function toDay(date) {
  return dayFormat.format(date);
}

function addXp(db, guildId, userId, amount, date = new Date()) {
  const total = transaction(db, () => {
    const row = db
      .prepare(
        `INSERT INTO members (guild, user, total_xp) VALUES (?, ?, ?)
         ON CONFLICT (guild, user) DO UPDATE SET total_xp = total_xp + excluded.total_xp
         RETURNING total_xp`,
      )
      .get(guildId, userId, amount);

    db.prepare(
      `INSERT INTO xp_daily (guild, user, day, xp) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild, user, day) DO UPDATE SET xp = xp + excluded.xp`,
    ).run(guildId, userId, toDay(date), amount);

    return Number(row.total_xp);
  });

  return {
    previousLevel: getLevelProgress(total - amount).level,
    level: getLevelProgress(total).level,
  };
}

function countRanked(db, guildId) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM members WHERE guild = ? AND total_xp > 0",
    )
    .get(guildId);
  return Number(row.count);
}

module.exports = { toDay, addXp, countRanked };
