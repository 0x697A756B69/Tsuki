const { Collection } = require("discord.js");
const loadCommands = require("../loaders/loadCommands");
const buildSlashCommands = require("../loaders/buildSlashCommands");

const bot = { commands: new Collection() };
loadCommands(bot);
buildSlashCommands(bot.commands);
console.log(`${bot.commands.size} commands are valid`);
