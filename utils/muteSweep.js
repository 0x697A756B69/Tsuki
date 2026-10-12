const DAY = 24 * 60 * 60 * 1000;
const FIRST_WINDOW = 40 * DAY;
const REASON = "Tsuki : fin de la sourdine";

function expiredMutes(db, since, now) {
  return db
    .prepare(
      `SELECT w.guild AS guild, w.user AS user, s.mute_role AS role
       FROM warns w
       JOIN automod_settings s ON s.guild = w.guild
       WHERE s.mute_role IS NOT NULL
         AND w.sanction = 'timeout'
         AND w.timeout_until IS NOT NULL
       GROUP BY w.guild, w.user
       HAVING MAX(w.timeout_until) > ? AND MAX(w.timeout_until) <= ?`,
    )
    .all(since, now)
    .map((row) => ({
      guild: String(row.guild),
      user: String(row.user),
      role: String(row.role),
    }));
}

async function sweepMutes(bot, now = Date.now()) {
  const since = bot.muteSweptAt ?? now - FIRST_WINDOW;
  let lifted = 0;
  let failed = 0;
  for (const { guild: guildId, user, role } of expiredMutes(
    bot.db,
    since,
    now,
  )) {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) continue;
    try {
      const member =
        guild.members.cache.get(user) ??
        (await guild.members.fetch(user).catch(() => null));
      if (!member?.roles.cache.has(role)) continue;
      await member.roles.remove(role, REASON);
      lifted += 1;
    } catch {
      failed += 1;
    }
  }
  if (failed === 0) bot.muteSweptAt = now;
  return lifted;
}

module.exports = { FIRST_WINDOW, expiredMutes, sweepMutes };
