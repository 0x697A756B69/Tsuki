const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../../loaders/migrate");
const clientReady = require("../../events/clientReady");

function createBot() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return /** @type {any} */ ({
    db,
    user: { tag: "Tsuki#0" },
    guilds: { cache: new Map(), fetch: async () => null },
    channels: { fetch: async () => null },
  });
}

function quiet(t) {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.timers.enable({ apis: ["setInterval"] });
}

function stop(bot) {
  for (const { timer } of Object.values(bot.timers)) clearInterval(timer);
}

test("clientReady starts every timer once and creates the raid memory", async (t) => {
  quiet(t);
  const bot = createBot();
  await clientReady(bot);
  t.after(() => stop(bot));

  assert.deepEqual(Object.keys(bot.timers).sort(), [
    "mutes",
    "purgeLogs",
    "purgeRaid",
    "purgeRooms",
    "raid",
    "rooms",
    "voice",
  ]);
  assert.ok(bot.raidMemory instanceof Map);
});

test("clientReady keeps the same timers when the bot reconnects", async (t) => {
  quiet(t);
  const bot = createBot();
  await clientReady(bot);
  t.after(() => stop(bot));
  const { timers, raidMemory } = bot;
  await clientReady(bot);

  assert.equal(bot.timers, timers);
  assert.equal(bot.raidMemory, raidMemory);
});
