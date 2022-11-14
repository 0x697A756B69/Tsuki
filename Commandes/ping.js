const Discord = require("discord.js");

module.exports = {
  name: "ping",
  description: "Envoyer une requête ping.",
  permission: "Aucune",
  category: "Information",
  dm: true,

  async run(bot, message) {
    await message.reply(`🏓Pong! \`${bot.ws.ping}\``);
  },
};
