const { getJoinSignals } = require("./joinSignals");
const { evaluateRaid, MINUTE } = require("./raidDetector");
const { recordJoin, recordTier, getLastTier } = require("./raidLog");

function getEntry(db, memory, guildId) {
  let entry = memory.get(guildId);
  if (!entry) {
    const last = getLastTier(db, guildId);
    entry = {
      recent: [],
      state: last === null ? null : { tier: last.tier, heldAt: last.at },
    };
    memory.set(guildId, entry);
  }
  return entry;
}

function pruneRecent(entry, settings, now) {
  const since = now - settings.windowMinutes * MINUTE;
  entry.recent = entry.recent.filter((join) => join.joinedAt >= since);
}

function refreshRaid(db, memory, guildId, settings, now) {
  const entry = getEntry(db, memory, guildId);
  pruneRecent(entry, settings, now);
  const evaluation = evaluateRaid({
    joins: entry.recent,
    settings,
    previous: entry.state,
    now,
  });
  entry.state = { tier: evaluation.tier, heldAt: evaluation.heldAt };
  if (evaluation.changed)
    recordTier(
      db,
      guildId,
      evaluation.tier,
      evaluation.count,
      settings.observation,
      now,
    );
  return { evaluation, recent: entry.recent };
}

function observeJoin(db, memory, guildId, member, settings, now) {
  const entry = getEntry(db, memory, guildId);
  pruneRecent(entry, settings, now);
  const signals = getJoinSignals(member, entry.recent, settings);
  entry.recent.push({ ...member, signals });
  recordJoin(db, {
    guild: guildId,
    user: member.user,
    joinedAt: member.joinedAt,
    createdAt: member.createdAt,
    signals,
    invite: member.invite,
  });
  return { signals, ...refreshRaid(db, memory, guildId, settings, now) };
}

module.exports = { getEntry, observeJoin, refreshRaid };
