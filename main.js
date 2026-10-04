const { Client, Collection, GatewayIntentBits } = require("discord.js");
const loadCommands = require("./loaders/loadCommands");
const loadEvents = require("./loaders/loadEvents");
const loadDatabase = require("./loaders/loadDatabase");
const loadComponents = require("./loaders/loadComponents");

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
bot.components = new Collection();
bot.utils = { createId: require("./utils/createId") };
bot.db = loadDatabase();

process.on("unhandledRejection", (err) =>
  console.error("[unhandledRejection]", err),
);

loadCommands(bot);
loadComponents(bot);
loadEvents(bot);
bot.login(process.env.TOKEN);
