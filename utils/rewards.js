const transaction = require("./transaction");
const { getLevelProgress } = require("./levels");

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

async function updateRewardRoles(db, guildId, member, level) {
  const rewards = getRewards(db, guildId);
  if (rewards.length === 0) return { added: null, removed: [] };
  try {
    return await syncRewardRoles(member, rewards, level);
  } catch {
    return { added: null, removed: [], failed: true };
  }
}

async function resyncRewardRoles(db, guildId, members) {
  const rewards = getRewards(db, guildId);
  const totals = new Map(
    db
      .prepare("SELECT user, total_xp FROM members WHERE guild = ?")
      .all(guildId)
      .map((row) => [String(row.user), Number(row.total_xp)]),
  );

  const report = { checked: 0, fixed: 0, failed: 0 };
  for (const member of members.values()) {
    if (member.user.bot) continue;
    report.checked++;
    const { level } = getLevelProgress(totals.get(member.id) ?? 0);
    try {
      const { added, removed } = await syncRewardRoles(member, rewards, level);
      if (added !== null || removed.length > 0) report.fixed++;
    } catch {
      report.failed++;
    }
  }
  return report;
}

module.exports = {
  getRewards,
  setReward,
  removeReward,
  rewardRoleFor,
  syncRewardRoles,
  updateRewardRoles,
  resyncRewardRoles,
};
