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

function getActivityBuckets(period, date) {
  const today = toDay(date);
  const monday = getPeriodStart("week", date);
  if (period === "week")
    return Array.from({ length: 7 }, (_, index) => ({
      start: shiftDay(monday, index),
      end: shiftDay(monday, index),
    }));
  if (period === "month")
    return Array.from({ length: 4 }, (_, index) => {
      const start = shiftDay(monday, (index - 3) * 7);
      return { start, end: shiftDay(start, 6) };
    });
  if (period === "global") {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7)) - 1;
    return Array.from({ length: 6 }, (_, index) => {
      const first = new Date(Date.UTC(year, month - 5 + index, 1, 12));
      const last = new Date(Date.UTC(year, month - 4 + index, 0, 12));
      return {
        start: first.toISOString().slice(0, 10),
        end: last.toISOString().slice(0, 10),
      };
    });
  }
  throw new RangeError(`Unknown period: ${period}`);
}

function getActivity(db, guildId, type, period, date = new Date()) {
  const { table, column } = getSource(type);
  const buckets = getActivityBuckets(period, date);
  const rows = db
    .prepare(
      `SELECT day, SUM(${column}) AS value FROM ${table}
       WHERE guild = ? AND day >= ? AND day <= ?
       GROUP BY day`,
    )
    .all(guildId, buckets[0].start, buckets[buckets.length - 1].end);

  return buckets.map(({ start, end }) => ({
    day: start,
    value: rows
      .filter((row) => String(row.day) >= start && String(row.day) <= end)
      .reduce((total, row) => total + Number(row.value), 0),
  }));
}

module.exports = {
  getPeriodStart,
  getTopMembers,
  getTopChannels,
  getActivity,
};
