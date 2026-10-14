const MAX_MULTIPLIER = 3;

function getModifiers(db, guildId) {
  const modifiers = { role: new Map(), channel: new Map() };
  const rows = db
    .prepare(
      "SELECT type, target, multiplier FROM xp_modifiers WHERE guild = ?",
    )
    .all(guildId);
  for (const row of rows)
    modifiers[String(row.type)].set(String(row.target), Number(row.multiplier));
  return modifiers;
}

function setModifier(db, guildId, type, target, multiplier) {
  if (multiplier === 1)
    db.prepare(
      "DELETE FROM xp_modifiers WHERE guild = ? AND type = ? AND target = ?",
    ).run(guildId, type, target);
  else
    db.prepare(
      `INSERT INTO xp_modifiers (guild, type, target, multiplier) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild, type, target) DO UPDATE SET multiplier = excluded.multiplier`,
    ).run(guildId, type, target, multiplier);
}

function computeMultiplier(
  modifiers,
  { channelId, parentId, roleIds },
  bonus = 1,
) {
  const channel =
    modifiers.channel.get(channelId) ?? modifiers.channel.get(parentId) ?? 1;

  const roles = roleIds
    .map((id) => modifiers.role.get(id))
    .filter((multiplier) => multiplier !== undefined);
  if (roles.includes(0)) return 0;
  const role = roles.length > 0 ? Math.max(...roles) : 1;

  return Math.min(channel * role * bonus, MAX_MULTIPLIER);
}

module.exports = {
  MAX_MULTIPLIER,
  getModifiers,
  setModifier,
  computeMultiplier,
};
