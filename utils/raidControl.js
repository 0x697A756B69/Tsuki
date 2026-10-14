const { SIGNAL_LABELS, isSuspect } = require("./joinSignals");
const { MINUTE } = require("./raidDetector");
const { recordTier } = require("./raidLog");
const { syncLockdown } = require("./raidLockdown");
const { getEntry } = require("./raidWatch");
const { describeFailure } = require("./core/failure");

const RELEASABLE = ["timeout", "quarantine"];

function groupOf(entry, settings) {
  return entry.recent.filter(
    (join) =>
      !entry.freed.has(join.user) &&
      (settings.scope === "all" || isSuspect(join.signals)),
  );
}

function prepare(bot, guildId) {
  return getEntry(bot.db, bot.raidMemory, guildId);
}

async function undo(guild, userId, action, settings) {
  const member =
    guild.members.cache.get(userId) ??
    (await guild.members.fetch(userId).catch(() => null));
  if (!member) throw new Error("Member not found");
  if (action === "timeout") await member.timeout(null, "Tsuki : libéré");
  else await member.roles.remove(settings.quarantineRole, "Tsuki : libéré");
}

function describeGroup(bot, guildId, settings) {
  const entry = prepare(bot, guildId);
  const members = groupOf(entry, settings).filter(
    (join) => entry.handled.get(join.user) !== "ban",
  );
  const signals = {};
  for (const join of members)
    for (const signal of join.signals)
      signals[SIGNAL_LABELS[signal]] =
        (signals[SIGNAL_LABELS[signal]] ?? 0) + 1;
  return { users: members.map((join) => join.user), signals };
}

async function freeGroup(bot, guild, settings) {
  const entry = prepare(bot, guild.id);
  const result = { freed: [], failed: [], causes: [] };
  for (const [userId, action] of [...entry.handled]) {
    if (!RELEASABLE.includes(action)) continue;
    try {
      await undo(guild, userId, action, settings);
      entry.handled.delete(userId);
      result.freed.push(userId);
    } catch (err) {
      result.failed.push(userId);
      result.causes.push(describeFailure(err));
    }
  }
  for (const join of entry.recent) entry.freed.add(join.user);
  return result;
}

async function banGroup(bot, guild, settings) {
  const { users } = describeGroup(bot, guild.id, settings);
  const entry = prepare(bot, guild.id);
  const result = { banned: [], failed: [], causes: [] };
  for (const userId of users) {
    try {
      await guild.members.ban(userId, { reason: "Tsuki : raid confirmé" });
      entry.handled.set(userId, "ban");
      result.banned.push(userId);
    } catch (err) {
      result.failed.push(userId);
      result.causes.push(describeFailure(err));
    }
  }
  return result;
}

async function liftRaid(bot, guild, settings, now) {
  const released = await freeGroup(bot, guild, settings);
  const entry = prepare(bot, guild.id);
  entry.recent = [];
  entry.handled.clear();
  entry.freed.clear();
  const wasActive = entry.state !== null && entry.state.tier !== "calm";
  entry.state = { tier: "calm", heldAt: now };
  if (wasActive)
    recordTier(bot.db, guild.id, "calm", 0, settings.observation, now);
  const lockdown = await syncLockdown(bot.db, guild, settings, "calm", now);
  return { ...released, lockdown };
}

function extendRaid(bot, guildId, settings, now) {
  const entry = prepare(bot, guildId);
  if (entry.state === null || entry.state.tier === "calm") return null;
  entry.state = { ...entry.state, heldAt: now };
  return now + settings.calmMinutes * MINUTE;
}

module.exports = {
  banGroup,
  describeGroup,
  extendRaid,
  freeGroup,
  liftRaid,
};
