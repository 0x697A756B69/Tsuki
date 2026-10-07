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

module.exports = {
  getRewards,
  setReward,
  removeReward,
};
