const { toDay } = require("./xp");

const SOURCES = {
  messages: { table: "message_daily", column: "messages" },
  voice: { table: "voice_daily", column: "minutes" },
};

function shiftDay(day, offset) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getPeriodStart(period, date = new Date()) {
  const today = toDay(date);
  if (period === "global") return null;
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    return shiftDay(today, -((weekday + 6) % 7));
  }
  throw new RangeError(`Unknown period: ${period}`);
}

function getSource(type) {
  const source = SOURCES[type];
  if (!source) throw new RangeError(`Unknown leaderboard type: ${type}`);
  return source;
}

function getTopMembers(
  db,
  guildId,
  type,
  period,
  date = new Date(),
  limit = 10,
) {
  const { table, column } = getSource(type);
  const start = getPeriodStart(period, date);
  return db
    .prepare(
      `SELECT user, SUM(${column}) AS value FROM ${table}
       WHERE guild = ? AND day >= ?
       GROUP BY user HAVING value > 0
       ORDER BY value DESC, user ASC LIMIT ?`,
    )
    .all(guildId, start ?? "", limit)
    .map((row) => ({ user: String(row.user), value: Number(row.value) }));
}

function getTopChannels(db, guildId, period, date = new Date(), limit = 5) {
  const start = getPeriodStart(period, date);
  return db
    .prepare(
      `SELECT channel, SUM(messages) AS value FROM message_daily
       WHERE guild = ? AND day >= ?
       GROUP BY channel HAVING value > 0
       ORDER BY value DESC, channel ASC LIMIT ?`,
    )
    .all(guildId, start ?? "", limit)
    .map((row) => ({ channel: String(row.channel), value: Number(row.value) }));
}

function getActivity(db, guildId, type, date = new Date(), days = 7) {
  const { table, column } = getSource(type);
  const today = toDay(date);
  const first = shiftDay(today, 1 - days);
  const totals = new Map(
    db
      .prepare(
        `SELECT day, SUM(${column}) AS value FROM ${table}
         WHERE guild = ? AND day >= ? AND day <= ?
         GROUP BY day`,
      )
      .all(guildId, first, today)
      .map((row) => [String(row.day), Number(row.value)]),
  );

  return Array.from({ length: days }, (_, index) => {
    const day = shiftDay(first, index);
    return { day, value: totals.get(day) ?? 0 };
  });
}

module.exports = {
  getPeriodStart,
  getTopMembers,
  getTopChannels,
  getActivity,
};
