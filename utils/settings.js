const COLUMNS = {
  announceMode: "announce_mode",
  announceChannel: "announce_channel",
  announceMessage: "announce_message",
  xpMin: "xp_min",
  xpMax: "xp_max",
  cooldown: "cooldown",
};

function toSettings(row) {
  return {
    announceMode: String(row.announce_mode),
    announceChannel:
      row.announce_channel === null ? null : String(row.announce_channel),
    announceMessage: String(row.announce_message),
    xpMin: Number(row.xp_min),
    xpMax: Number(row.xp_max),
    cooldown: Number(row.cooldown),
    updatedBy: row.updated_by === null ? null : String(row.updated_by),
    updatedAt: row.updated_at === null ? null : Number(row.updated_at),
  };
}

function getSettings(db, guildId) {
  const select = db.prepare("SELECT * FROM guild_settings WHERE guild = ?");
  let row = select.get(guildId);
  if (!row) {
    db.prepare("INSERT INTO guild_settings (guild) VALUES (?)").run(guildId);
    row = select.get(guildId);
  }
  return toSettings(row);
}

function updateSettings(db, guildId, changes, authorId, date = Date.now()) {
  const entries = Object.entries(changes);
  for (const [key] of entries)
    if (!(key in COLUMNS)) throw new TypeError(`Unknown setting: ${key}`);

  getSettings(db, guildId);
  const assignments = entries.map(([key]) => `${COLUMNS[key]} = ?`).join(", ");
  db.prepare(
    `UPDATE guild_settings SET ${assignments}, updated_by = ?, updated_at = ? WHERE guild = ?`,
  ).run(...entries.map(([, value]) => value), authorId, date, guildId);
  return getSettings(db, guildId);
}

module.exports = { getSettings, updateSettings };
