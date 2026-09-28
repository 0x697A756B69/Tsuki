const { CommandInteractionOptionResolver } = require("discord.js");
const fs = require("fs");

module.exports = async (bot) => {
  fs.readdirSync("./Commandes")
    .filter((f) => f.endsWith(".js"))
    .forEach(async (file) => {
      let command = require(`../Commandes/${file}`);
      if (!command) return message.reply("Cette commande n'existe pas !");
      if (!command.name || typeof command.name !== "string")
        throw new TypeError(`Command ${file} has no name`);
      bot.commands.set(command.name, command);
      console.log(`Loaded command ${command.name}`);
    });
};
