const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../commands");

function scripts(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".js") && file !== "index.js")
    .map((file) => require(path.join(dir, file)));
}

function folders(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}

function byName(items) {
  return new Map(items.map((item) => [item.name, item]));
}

function loadGroup(dir) {
  const command = require(path.join(dir, "index.js"));
  if (command.permission === undefined || command.category === undefined)
    throw new TypeError(
      `Command ${command.name} needs a permission and a category`,
    );

  const subcommands = byName(scripts(dir));
  const groups = byName(
    folders(dir).map((folder) => ({
      ...require(path.join(folder, "index.js")),
      subcommands: byName(scripts(folder)),
    })),
  );

  return {
    ...command,
    subcommands,
    groups,
    run(bot, interaction, args, db) {
      const group = args.getSubcommandGroup(false);
      const scope = group ? groups.get(group).subcommands : subcommands;
      return scope.get(args.getSubcommand()).run(bot, interaction, args, db);
    },
  };
}

module.exports = (bot, dir = root) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const command = entry.isDirectory()
      ? loadGroup(file)
      : entry.name.endsWith(".js") && require(file);
    if (!command) continue;

    if (typeof command.name !== "string")
      throw new TypeError(`Command ${entry.name} has no name`);
    bot.commands.set(command.name, command);
    console.log(`Loaded command ${command.name}`);
  }
};
