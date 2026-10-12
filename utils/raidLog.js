const RETENTION = 30 * 24 * 60 * 60 * 1000;

function recordJoin(
  db,
  { guild, user, joinedAt, createdAt, signals = [], invite = null },
) {
  db.prepare(
    `INSERT OR REPLACE INTO raid_joins
       (guild, user, joined_at, created_at, signals, invite)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(guild, user, joinedAt, createdAt, signals.join(","), invite);
}

function getJoinsSince(db, guildId, since) {
  return db
    .prepare(
      `SELECT user, joined_at, created_at, signals, invite
       FROM raid_joins WHERE guild = ? AND joined_at >= ?
       ORDER BY joined_at, user`,
    )
    .all(guildId, since)
    .map((row) => ({
      user: String(row.user),
      joinedAt: Number(row.joined_at),
      createdAt: Number(row.created_at),
      signals: row.signals === "" ? [] : String(row.signals).split(","),
      invite: row.invite === null ? null : String(row.invite),
    }));
}

function recordTier(
  db,
  guildId,
  tier,
  joins,
  observed = false,
  date = Date.now(),
) {
  db.prepare(
    `INSERT INTO raid_tiers (guild, tier, joins, observed, at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(guildId, tier, joins, Number(observed), date);
}

function getLastTier(db, guildId) {
  const row = db
    .prepare(
      `SELECT tier, joins, observed, at FROM raid_tiers
       WHERE guild = ? ORDER BY at DESC, id DESC LIMIT 1`,
    )
    .get(guildId);
  if (!row) return null;
  return {
    tier: String(row.tier),
    joins: Number(row.joins),
    observed: Number(row.observed) === 1,
    at: Number(row.at),
  };
}

function purgeRaidLogs(db, now = Date.now()) {
  const limit = now - RETENTION;
  const joins = db
    .prepare("DELETE FROM raid_joins WHERE joined_at < ?")
    .run(limit);
  const tiers = db.prepare("DELETE FROM raid_tiers WHERE at < ?").run(limit);
  return Number(joins.changes) + Number(tiers.changes);
}

module.exports = {
  RETENTION,
  recordJoin,
  getJoinsSince,
  recordTier,
  getLastTier,
  purgeRaidLogs,
};
