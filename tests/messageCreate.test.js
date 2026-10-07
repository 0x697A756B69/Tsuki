const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const messageCreate = require("../events/messageCreate");
const { updateSettings } = require("../utils/settings");
const { setModifier } = require("../utils/modifiers");
const { setReward } = require("../utils/rewards");
const { addXp } = require("../utils/xp");

const granted = [];

function createBot() {
  granted.length = 0;
  announced.length = 0;
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateSettings(
    db,
    "g",
    { xpMin: 20, xpMax: 20, announceMode: "off" },
    "admin",
  );
  return { db };
}

const announced = [];

function message(
  author,
  { channelId = `${author}-channel`, parentId = null, roles = [] } = {},
) {
  return {
    author: { bot: false, id: author },
    inGuild: () => true,
    guildId: "g",
    channelId,
    channel: {
      isThread: () => parentId !== null,
      parentId,
      send: async (payload) => announced.push(payload.content),
    },
    content: "salut tout le monde",
    mentions: { repliedUser: null },
    member: {
      guild: { roles: { cache: new Map([["regular", {}]]) } },
      roles: {
        cache: new Map(roles.map((id) => [id, {}])),
        add: async (role) => granted.push(role),
        remove: async () => {},
      },
    },
  };
}

function xpOf(bot, author) {
  const row = bot.db
    .prepare("SELECT total_xp FROM members WHERE user = ?")
    .get(author);
  return row ? Number(row.total_xp) : 0;
}

test("a normal message gives the base XP", async () => {
  const bot = createBot();
  await messageCreate(bot, message("normal"));
  assert.equal(xpOf(bot, "normal"), 20);
});

test("a role bonus multiplies the XP", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "role", "booster", 1.5);
  await messageCreate(bot, message("booster", { roles: ["booster"] }));
  assert.equal(xpOf(bot, "booster"), 30);
});

test("an excluded channel gives no XP", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "channel", "spam", 0);
  await messageCreate(bot, message("spammer", { channelId: "spam" }));
  assert.equal(xpOf(bot, "spammer"), 0);
});

test("a thread of an excluded channel gives no XP", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "channel", "spam", 0);
  await messageCreate(
    bot,
    message("threader", { channelId: "thread", parentId: "spam" }),
  );
  assert.equal(xpOf(bot, "threader"), 0);
});

test("an excluded role gives no XP", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "role", "muted", 0);
  await messageCreate(bot, message("muted", { roles: ["muted"] }));
  assert.equal(xpOf(bot, "muted"), 0);
});

test("reaching a level with a reward gives the role", async () => {
  const bot = createBot();
  setReward(bot.db, "g", 1, "regular");
  addXp(bot.db, "g", "climber", 90);

  await messageCreate(bot, message("climber"));

  assert.deepEqual(granted, ["regular"]);
});

test("a message without a level up does not touch the roles", async () => {
  const bot = createBot();
  setReward(bot.db, "g", 1, "regular");

  await messageCreate(bot, message("beginner"));

  assert.deepEqual(granted, []);
});

test("the level up announcement mentions the role gained", async () => {
  const bot = createBot();
  updateSettings(
    bot.db,
    "g",
    { announceMode: "current", announceMessage: "{niveau} {role}" },
    "admin",
  );
  setReward(bot.db, "g", 1, "regular");
  addXp(bot.db, "g", "rewarded", 90);

  await messageCreate(bot, message("rewarded"));

  assert.deepEqual(announced, ["1 <@&regular>"]);
});

test("the level up announcement has no role when none was gained", async () => {
  const bot = createBot();
  updateSettings(
    bot.db,
    "g",
    { announceMode: "current", announceMessage: "{niveau} {role}" },
    "admin",
  );
  addXp(bot.db, "g", "unrewarded", 90);

  await messageCreate(bot, message("unrewarded"));

  assert.deepEqual(announced, ["1"]);
});
