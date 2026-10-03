const { Collection, REST, Routes } = require("discord.js");
const loadCommands = require("../loaders/loadCommands");
const buildSlashCommands = require("../loaders/buildSlashCommands");

async function main() {
  const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!TOKEN || !CLIENT_ID || !GUILD_ID)
    throw new Error("Missing TOKEN, CLIENT_ID or GUILD_ID in .env file");

  const bot = { commands: new Collection() };
  loadCommands(bot);

  const globalCommands = bot.commands.filter((command) => command.dm);
  const guildCommands = bot.commands.filter((command) => !command.dm);

  const rest = new REST().setToken(TOKEN);

  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: buildSlashCommands(globalCommands),
  });
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: buildSlashCommands(guildCommands),
  });

  console.log(
    `Registered ${globalCommands.size} global and ${guildCommands.size} guild commands`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
