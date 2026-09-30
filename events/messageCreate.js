const COOLDOWN = 60_000;
const cooldowns = new Map();

module.exports = async (bot, message) => {
  if (message.author.bot || !message.inGuild()) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) ?? 0) < COOLDOWN) return;
  cooldowns.set(key, now);

  const gain = Math.floor(Math.random() * 25) + 1;
  const { xp, level } = bot.db
    .prepare(
      `INSERT INTO xp (guild, user, xp) VALUES (?, ?, ?)
       ON CONFLICT (guild, user) DO UPDATE SET xp = xp + excluded.xp
       RETURNING xp, level`,
    )
    .get(message.guildId, message.author.id, gain);

  const needed = (level + 1) * 1000;
  if (xp < needed) return;

  bot.db
    .prepare(
      "UPDATE xp SET xp = xp - ?, level = level + 1 WHERE guild = ? AND user = ?",
    )
    .run(needed, message.guildId, message.author.id);

  await message.channel.send(
    `${message.author} est passé niveau ${level + 1}, félicitations !`,
  );
};
