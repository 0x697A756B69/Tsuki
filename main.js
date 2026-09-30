const { Client, Collection, GatewayIntentBits } = require("discord.js");
const loadCommands = require("./loaders/loadCommands");
const loadEvents = require("./loaders/loadEvents");

if (!process.env.TOKEN) {
  console.error("Missing TOKEN in .env file");
  process.exit(1);
}

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ],
});

bot.commands = new Collection();
bot.utils = { createId: require("./utils/createId") };

process.on("unhandledRejection", (err) =>
  console.error("[unhandledRejection]", err),
);

loadCommands(bot);
loadEvents(bot);
bot.login(process.env.TOKEN);
