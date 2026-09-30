const fs = require("node:fs");
const path = require("node:path");

module.exports = (bot) => {
  const dir = path.join(__dirname, "../commands");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(dir, file));
    if (typeof command.name !== "string")
      throw new TypeError(`Command ${file} has no name`);
    bot.commands.set(command.name, command);
    console.log(`Loaded command ${command.name}`);
  }
};
