const loadSlashCommands = require("../loaders/loadSlashCommands");

module.exports = async (bot) => {
  await loadSlashCommands(bot);
  console.log(`Logged in as ${bot.user.tag}`);
};
