const { CommandInteractionOptionResolver } = require("discord.js");
const fs = require("fs");

module.exports = async (bot) => {
  fs.readdirSync("./Commandes")
    .filter((f) => f.endsWith(".js"))
    .forEach(async (file) => {
      let command = require(`../Commandes/${file}`);
      if (!command) return message.reply("Cette commande n'existe pas !");
      if (!command.name || typeof command.name !== "string")
        throw new TypeError(
          `La commandes ${file.slice(0, file.length - 3)} n'a pas de nom !`
        );
      bot.commands.set(command.name, command);
      console.log(`Commandes ${file} chargés avec succes`);
    });
};
