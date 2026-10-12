const { getLevelProgress } = require("./levels");
const transaction = require("./transaction");

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
});

function toDay(date) {
  return dayFormat.format(date);
}

const XP_COLUMNS = {
  messages: "message_xp",
  voice: "voice_xp",
  manual: "manual_xp",
};

const RANK_COLUMNS = {
  global: "total_xp",
  messages: "message_xp",
  voice: "voice_xp",
};

function getRankColumn(type) {
  const column = RANK_COLUMNS[type];
  if (!column) throw new RangeError(`Unknown rank type: ${type}`);
  return column;
}

function getTotalXp(db, guildId, userId) {
  const row = db
    .prepare("SELECT total_xp FROM members WHERE guild = ? AND user = ?")
    .get(guildId, userId);
  return Number(row?.total_xp ?? 0);
}

function getTypeXp(db, guildId, userId, type = "global") {
  const row = db
    .prepare(
      `SELECT ${getRankColumn(type)} AS xp FROM members WHERE guild = ? AND user = ?`,
    )
    .get(guildId, userId);
  return Number(row?.xp ?? 0);
}

function getBreakdown(db, guildId, userId) {
  const row = db
    .prepare(
      "SELECT message_xp, voice_xp, manual_xp FROM members WHERE guild = ? AND user = ?",
    )
    .get(guildId, userId);
  return {
    messages: Number(row?.message_xp ?? 0),
    voice: Number(row?.voice_xp ?? 0),
    manual: Number(row?.manual_xp ?? 0),
  };
}

function addXp(db, guildId, userId, amount, source, date = new Date()) {
  const column = XP_COLUMNS[source];
  if (!column) throw new RangeError(`Unknown XP source: ${source}`);

  return transaction(db, () => {
    const previousTotal = getTotalXp(db, guildId, userId);
    const applied = Math.max(amount, -previousTotal);

    db.prepare(
      `INSERT INTO members (guild, user, total_xp, ${column}) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild, user) DO UPDATE SET
         total_xp = total_xp + excluded.total_xp,
         ${column} = ${column} + excluded.${column}`,
    ).run(guildId, userId, applied, applied);

    db.prepare(
      `INSERT INTO xp_daily (guild, user, day, source, xp) VALUES (?, ?, ?, ?, MAX(0, ?))
       ON CONFLICT (guild, user, day, source) DO UPDATE SET xp = MAX(0, xp + ?)`,
    ).run(guildId, userId, toDay(date), source, applied, applied);

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

function countRanked(db, guildId, type = "global") {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM members WHERE guild = ? AND ${getRankColumn(type)} > 0`,
    )
    .get(guildId);
  return Number(row.count);
}

function getRank(db, guildId, userId, type = "global") {
  const xp = getTypeXp(db, guildId, userId, type);
  if (xp <= 0) return null;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM members WHERE guild = ? AND ${getRankColumn(type)} > ?`,
    )
    .get(guildId, xp);
  return {
    position: Number(row.count) + 1,
    ranked: countRanked(db, guildId, type),
  };
}

module.exports = {
  XP_COLUMNS,
  RANK_COLUMNS,
  toDay,
  getTotalXp,
  getTypeXp,
  getBreakdown,
  addXp,
  resetXp,
  countRanked,
  getRank,
};
