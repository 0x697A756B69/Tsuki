const fs = require("node:fs");
const path = require("node:path");

module.exports = (bot) => {
  const dir = path.join(__dirname, "../events");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const name = file.slice(0, -3);
    const event = require(path.join(dir, file));
    bot.on(name, async (...args) => {
      try {
        await event(bot, ...args);
      } catch (err) {
        console.error(`[event ${name}]`, err);
      }
    });
    console.log(`Loaded event ${name}`);
  }
};
