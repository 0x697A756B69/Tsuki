const { getLevelProgress } = require("./levels");
const transaction = require("./transaction");

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
});

function toDay(date) {
  return dayFormat.format(date);
}

function getTotalXp(db, guildId, userId) {
  const row = db
    .prepare("SELECT total_xp FROM members WHERE guild = ? AND user = ?")
    .get(guildId, userId);
  return Number(row?.total_xp ?? 0);
}

function addXp(db, guildId, userId, amount, date = new Date()) {
  return transaction(db, () => {
    const previousTotal = getTotalXp(db, guildId, userId);
    const applied = Math.max(amount, -previousTotal);

    db.prepare(
      `INSERT INTO members (guild, user, total_xp) VALUES (?, ?, ?)
       ON CONFLICT (guild, user) DO UPDATE SET total_xp = total_xp + excluded.total_xp`,
    ).run(guildId, userId, applied);

    db.prepare(
      `INSERT INTO xp_daily (guild, user, day, xp) VALUES (?, ?, ?, MAX(0, ?))
       ON CONFLICT (guild, user, day) DO UPDATE SET xp = MAX(0, xp + ?)`,
    ).run(guildId, userId, toDay(date), applied, applied);

    const total = previousTotal + applied;
    return {
      previousLevel: getLevelProgress(previousTotal).level,
      level: getLevelProgress(total).level,
      previousTotal,
      total,
    };
  });
}

function resetXp(db, guildId, userId) {
  return transaction(db, () => {
    const previousTotal = getTotalXp(db, guildId, userId);
    db.prepare("DELETE FROM members WHERE guild = ? AND user = ?").run(
      guildId,
      userId,
    );
    db.prepare("DELETE FROM xp_daily WHERE guild = ? AND user = ?").run(
      guildId,
      userId,
    );
    return previousTotal;
  });
}

function countRanked(db, guildId) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM members WHERE guild = ? AND total_xp > 0",
    )
    .get(guildId);
  return Number(row.count);
}

module.exports = { toDay, getTotalXp, addXp, resetXp, countRanked };
