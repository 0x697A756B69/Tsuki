function purgeChannel(db, guildId, channelId) {
  db.prepare("DELETE FROM message_daily WHERE guild = ? AND channel = ?").run(
    guildId,
    channelId,
  );
  db.prepare(
    "DELETE FROM xp_modifiers WHERE guild = ? AND type = 'channel' AND target = ?",
  ).run(guildId, channelId);
}

function findMissingChannels(db, guildId, existingIds) {
  const rows = db
    .prepare(
      `SELECT channel AS id FROM message_daily WHERE guild = ?
       UNION
       SELECT target AS id FROM xp_modifiers WHERE guild = ? AND type = 'channel'`,
    )
    .all(guildId, guildId);
  return rows.map((row) => String(row.id)).filter((id) => !existingIds.has(id));
}

async function sweepDeletedChannels(bot) {
  for (const guild of bot.guilds.cache.values()) {
    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) continue;
    const existing = new Set(channels.keys());
    for (const id of findMissingChannels(bot.db, guild.id, existing))
      purgeChannel(bot.db, guild.id, id);
  }
}

module.exports = { purgeChannel, findMissingChannels, sweepDeletedChannels };
