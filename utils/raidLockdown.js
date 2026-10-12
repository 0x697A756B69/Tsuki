const { GuildVerificationLevel } = require("discord.js");

const DAY = 24 * 60 * 60 * 1000;
const REASON = "Tsuki : verrouillage anti-raid";
const MODE_LABELS = {
  invites: "invitations en pause",
  verification: "vérification maximale",
};

function getLockdown(db, guildId) {
  const row = db
    .prepare("SELECT * FROM raid_lockdowns WHERE guild = ?")
    .get(guildId);
  if (!row) return null;
  return {
    mode: String(row.mode),
    previousLevel:
      row.previous_level === null ? null : Number(row.previous_level),
    previousInvitesUntil:
      row.previous_invites_until === null
        ? null
        : Number(row.previous_invites_until),
    startedAt: Number(row.started_at),
  };
}

function saveLockdown(db, guildId, lockdown) {
  db.prepare(
    `INSERT OR REPLACE INTO raid_lockdowns
       (guild, mode, previous_level, previous_invites_until, started_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    guildId,
    lockdown.mode,
    lockdown.previousLevel,
    lockdown.previousInvitesUntil,
    lockdown.startedAt,
  );
}

function clearLockdown(db, guildId) {
  db.prepare("DELETE FROM raid_lockdowns WHERE guild = ?").run(guildId);
}

function planLockdown({ tier, settings, active }) {
  if (tier === "raid" && settings.lockdown !== "off" && active === null)
    return { action: "engage", mode: settings.lockdown };
  if (tier !== "raid" && active !== null)
    return { action: "release", mode: active.mode };
  return null;
}

async function engageLockdown(db, guild, mode, now) {
  const previousLevel = guild.verificationLevel;
  const until = guild.incidentsData?.invitesDisabledUntil;
  const lockdown = {
    mode,
    previousLevel: mode === "verification" ? previousLevel : null,
    previousInvitesUntil: mode === "invites" && until ? until.getTime() : null,
    startedAt: now,
  };
  if (mode === "invites")
    await guild.setIncidentActions({
      invitesDisabledUntil: new Date(now + DAY),
    });
  else if (previousLevel < GuildVerificationLevel.VeryHigh)
    await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, REASON);
  saveLockdown(db, guild.id, lockdown);
}

async function releaseLockdown(db, guild, active, now) {
  if (active.mode === "invites") {
    const until = active.previousInvitesUntil;
    await guild.setIncidentActions({
      invitesDisabledUntil:
        until !== null && until > now ? new Date(until) : null,
    });
  } else if (guild.verificationLevel !== active.previousLevel)
    await guild.setVerificationLevel(active.previousLevel, REASON);
  clearLockdown(db, guild.id);
}

async function syncLockdown(db, guild, settings, tier, now) {
  const active = getLockdown(db, guild.id);
  const plan = planLockdown({ tier, settings, active });
  if (plan === null) return null;
  if (plan.action === "engage" && settings.observation)
    return { ...plan, observed: true, ok: true };
  try {
    if (plan.action === "engage")
      await engageLockdown(db, guild, plan.mode, now);
    else await releaseLockdown(db, guild, active, now);
    return { ...plan, observed: false, ok: true };
  } catch {
    return { ...plan, observed: false, ok: false };
  }
}

module.exports = {
  MODE_LABELS,
  getLockdown,
  planLockdown,
  syncLockdown,
};
