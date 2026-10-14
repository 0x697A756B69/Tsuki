const { isSuspect } = require("./joinSignals");
const { getRaidSettings, updateRaidSettings } = require("./raidSettings");
const { oncePerGuild } = require("../core/oncePerGuild");
const { getEntry } = require("./raidWatch");
const { describeFailure } = require("../core/failure");

const MINUTE = 60 * 1000;
const ACTIONS = ["log", "timeout", "quarantine", "kick", "ban"];
const ACTION_LABELS = {
  timeout: "mis en sourdine",
  quarantine: "placé en sas",
  kick: "expulsé",
  ban: "banni",
};
const ROLE_NAME = "Sas Tsuki";
const REASON = "Tsuki : protection anti-raid";

function actionFor(settings, tier) {
  if (tier === "watch") return settings.watchAction;
  if (tier === "alert") return settings.alertAction;
  if (tier === "raid") return settings.raidAction;
  return "log";
}

function planResponse({ tier, settings, recent, handled, freed = new Set() }) {
  const action = actionFor(settings, tier);
  if (action === "log") return { action, targets: [] };
  const rank = ACTIONS.indexOf(action);
  const targets = recent
    .filter((join) => !freed.has(join.user))
    .filter((join) => settings.scope === "all" || isSuspect(join.signals))
    .filter((join) => ACTIONS.indexOf(handled.get(join.user)) < rank)
    .map((join) => join.user);
  return { action, targets };
}

async function createQuarantineRole(db, guild) {
  const current = getRaidSettings(db, guild.id).quarantineRole;
  if (current && guild.roles.cache.has(current)) return current;
  const role = await guild.roles
    .create({ name: ROLE_NAME, permissions: [], reason: REASON })
    .catch(() => null);
  if (!role) return null;
  updateRaidSettings(db, guild.id, { quarantineRole: role.id }, "tsuki");
  for (const channel of guild.channels.cache.values())
    await channel.permissionOverwrites
      ?.edit(role, { ViewChannel: false })
      .catch(() => null);
  return role.id;
}

async function ensureQuarantineRole(db, guild, settings) {
  if (settings.quarantineRole && guild.roles.cache.has(settings.quarantineRole))
    return settings.quarantineRole;
  return oncePerGuild("quarantine", guild.id, () =>
    createQuarantineRole(db, guild),
  );
}

async function applyAction(guild, userId, action, settings, roleId) {
  if (action === "ban") {
    await guild.members.ban(userId, { reason: REASON });
    return;
  }
  const member =
    guild.members.cache.get(userId) ??
    (await guild.members.fetch(userId).catch(() => null));
  if (!member) throw new Error("Member not found");
  if (action === "timeout")
    await member.timeout(settings.timeoutMinutes * MINUTE, REASON);
  else if (action === "kick") await member.kick(REASON);
  else await member.roles.add(roleId, REASON);
}

async function respondToRaid(bot, guild, settings, { evaluation, recent }) {
  const entry = getEntry(bot.db, bot.raidMemory, guild.id);
  if (evaluation.tier === "calm") entry.handled.clear();

  const { action, targets } = planResponse({
    tier: evaluation.tier,
    settings,
    recent,
    handled: entry.handled,
    freed: entry.freed,
  });
  const response = {
    action,
    observed: settings.observation,
    planned: targets,
    done: [],
    failed: [],
    causes: [],
  };
  if (targets.length === 0 || settings.observation) return response;

  const previous = new Map(
    targets.map((userId) => [userId, entry.handled.get(userId)]),
  );
  const release = (userId) => {
    const before = previous.get(userId);
    if (before === undefined) entry.handled.delete(userId);
    else entry.handled.set(userId, before);
  };
  for (const userId of targets) entry.handled.set(userId, action);

  let roleId = null;
  if (action === "quarantine") {
    roleId = await ensureQuarantineRole(bot.db, guild, settings);
    if (roleId === null) {
      targets.forEach(release);
      response.failed.push(...targets);
      response.causes.push(describeFailure(new Error("Missing Permissions")));
      return response;
    }
  }
  for (const userId of targets) {
    try {
      await applyAction(guild, userId, action, settings, roleId);
      response.done.push(userId);
    } catch (err) {
      release(userId);
      response.failed.push(userId);
      response.causes.push(describeFailure(err));
    }
  }
  return response;
}

module.exports = {
  ACTIONS,
  ACTION_LABELS,
  actionFor,
  planResponse,
  respondToRaid,
};
