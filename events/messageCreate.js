const { addXp } = require("../utils/xp");

const COOLDOWN = 60_000;
const cooldowns = new Map();

module.exports = async (bot, message) => {
  if (message.author.bot || !message.inGuild()) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) ?? 0) < COOLDOWN) return;
  cooldowns.set(key, now);

  const gain = Math.floor(Math.random() * 25) + 1;
  const { previousLevel, level } = addXp(
    bot.db,
    message.guildId,
    message.author.id,
    gain,
  );

  if (level > previousLevel)
    await message.channel.send(
      `${message.author} est passé niveau ${level}, félicitations !`,
    );
};
