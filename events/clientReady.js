const Discord = require("discord.js");
const loadSlashCommands = require("../loaders/loadSlashCommands");
const loadDatabase = require("../loaders/loadDatabase");

module.exports = async (bot) => {
  bot.db = await loadDatabase();
  bot.db.connect(function () {
    console.log(`${bot.user.tag} est connectée à la base de données !`);
  });

  await loadSlashCommands(bot);
  console.log(`${bot.user.tag} est en ligne !`);
};
