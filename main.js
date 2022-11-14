const Discord = require("discord.js");
const intents = new Discord.IntentsBitField(3276799);
const bot = new Discord.Client({ intents });
const loadCommands = require("./Loaders/loadCommands");
const loadEvents = require("./Loaders/loadEvents");

bot.commands = new Discord.Collection();
bot.function = {
  createId: require("./Fonctions/createId"),
  calculXp: require("./Fonctions/calculXp"),
};

bot.login(process.env.TOKEN);
loadCommands(bot);
loadEvents(bot);
