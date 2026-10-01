const { Collection, REST, Routes } = require("discord.js");
const loadCommands = require("../loaders/loadCommands");
const buildSlashCommands = require("../loaders/buildSlashCommands");

async function main() {
  const { TOKEN, GUILD_ID } = process.env;
  if (!TOKEN || !GUILD_ID)
    throw new Error("Missing TOKEN or GUILD_ID in .env file");

  const bot = { commands: new Collection() };
  loadCommands(bot);

  const globalCommands = bot.commands.filter((command) => command.dm);
  const guildCommands = bot.commands.filter((command) => !command.dm);

  const rest = new REST().setToken(TOKEN);
  const app = await rest.get(Routes.currentApplication());

  await rest.put(Routes.applicationCommands(app.id), {
    body: buildSlashCommands(globalCommands),
  });
  await rest.put(Routes.applicationGuildCommands(app.id, GUILD_ID), {
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
