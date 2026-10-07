const transaction = require("./transaction");

function getRewards(db, guildId) {
  return db
    .prepare(
      "SELECT level, role FROM level_rewards WHERE guild = ? ORDER BY level",
    )
    .all(guildId)
    .map((row) => ({ level: Number(row.level), role: String(row.role) }));
}

function setReward(db, guildId, level, role) {
  transaction(db, () => {
    db.prepare("DELETE FROM level_rewards WHERE guild = ? AND role = ?").run(
      guildId,
      role,
    );
    db.prepare(
      `INSERT INTO level_rewards (guild, level, role) VALUES (?, ?, ?)
       ON CONFLICT (guild, level) DO UPDATE SET role = excluded.role`,
    ).run(guildId, level, role);
  });
}

function removeReward(db, guildId, role) {
  db.prepare("DELETE FROM level_rewards WHERE guild = ? AND role = ?").run(
    guildId,
    role,
  );
}

function rewardRoleFor(rewards, level) {
  let best = null;
  for (const reward of rewards)
    if (reward.level <= level && (best === null || reward.level > best.level))
      best = reward;
  return best?.role ?? null;
}

async function syncRewardRoles(member, rewards, level) {
  const existing = rewards.filter((reward) =>
    member.guild.roles.cache.has(reward.role),
  );
  const wanted = rewardRoleFor(existing, level);

  const stale = existing
    .map((reward) => reward.role)
    .filter((role) => role !== wanted && member.roles.cache.has(role));
  const missing = wanted !== null && !member.roles.cache.has(wanted);

  if (missing) await member.roles.add(wanted);
  if (stale.length > 0) await member.roles.remove(stale);

  return { added: missing ? wanted : null, removed: stale };
}

module.exports = {
  getRewards,
  setReward,
  removeReward,
  rewardRoleFor,
  syncRewardRoles,
};
