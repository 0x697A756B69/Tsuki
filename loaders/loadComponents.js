const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../components");

module.exports = (bot, dir = root) => {
  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const component = require(path.join(dir, file));
    if (typeof component.id !== "string")
      throw new TypeError(`Component ${file} has no id`);
    bot.components.set(component.id, component);
    console.log(`Loaded component ${component.id}`);
  }
};
