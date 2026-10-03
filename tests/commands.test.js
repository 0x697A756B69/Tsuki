const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { ApplicationCommandOptionType, Collection } = require("discord.js");
const loadCommands = require("../loaders/loadCommands");
const buildSlashCommands = require("../loaders/buildSlashCommands");

const fixtures = path.join(__dirname, "fixtures/commands");

function load() {
  const bot = { commands: new Collection() };
  test.mock.method(console, "log", () => {});
  loadCommands(bot, fixtures);
  return bot.commands;
}

function args(group, subcommand) {
  return {
    getSubcommandGroup: () => group,
    getSubcommand: () => subcommand,
  };
}

test("loads simple commands and folders", () => {
  assert.deepEqual([...load().keys()].sort(), ["admin", "ping"]);
});

test("builds subcommands and groups", () => {
  const admin = buildSlashCommands(load()).find((c) => c.name === "admin");

  assert.deepEqual(
    admin.options.map((o) => [o.name, o.type]),
    [
      ["hello", ApplicationCommandOptionType.Subcommand],
      ["settings", ApplicationCommandOptionType.SubcommandGroup],
    ],
  );
  assert.equal(admin.options[0].options[0].name, "membre");
  assert.equal(admin.options[1].options[0].name, "show");
});

test("routes to the right subcommand", async () => {
  const admin = load().get("admin");

  assert.equal(await admin.run(null, null, args(null, "hello"), null), "hello");
  assert.equal(
    await admin.run(null, null, args("settings", "show"), null),
    "show",
  );
});
