const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../../loaders/migrate");
const messageCreate = require("../../events/messageCreate");
const { updateSettings } = require("../../utils/xp/settings");
const { setModifier } = require("../../utils/xp/modifiers");
const { setReward } = require("../../utils/xp/rewards");
const { addXp } = require("../../utils/xp/xp");
const {
  addLog,
  setContestChannel,
} = require("../../utils/automod/automodLogs");

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

test("message XP is stored in the messages source", async () => {
  const bot = createBot();
  await messageCreate(bot, message("sourced"));
  const row = bot.db
    .prepare(
      "SELECT message_xp, voice_xp, manual_xp FROM members WHERE user = 'sourced'",
    )
    .get();
  assert.deepEqual({ ...row }, { message_xp: 20, voice_xp: 0, manual_xp: 0 });
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
  addXp(bot.db, "g", "climber", 90, "messages");

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
  addXp(bot.db, "g", "rewarded", 90, "messages");

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
  addXp(bot.db, "g", "unrewarded", 90, "messages");

  await messageCreate(bot, message("unrewarded"));

  assert.deepEqual(announced, ["1"]);
});

function countOf(bot, author) {
  const row = bot.db
    .prepare(
      "SELECT COALESCE(SUM(messages), 0) AS messages FROM message_daily WHERE user = ?",
    )
    .get(author);
  return Number(row.messages);
}

test("every message is counted, even without XP", async () => {
  const bot = createBot();
  await messageCreate(bot, message("counter"));
  await messageCreate(bot, message("counter"));
  assert.equal(xpOf(bot, "counter"), 20);
  assert.equal(countOf(bot, "counter"), 2);
});

test("a message in a thread is counted for its parent channel", async () => {
  const bot = createBot();
  await messageCreate(
    bot,
    message("threader", { channelId: "thread", parentId: "parent" }),
  );
  const row = bot.db
    .prepare("SELECT channel FROM message_daily WHERE user = 'threader'")
    .get();
  assert.equal(row.channel, "parent");
});

test("an excluded channel is not counted", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "channel", "spam", 0);
  await messageCreate(bot, message("spammer", { channelId: "spam" }));
  assert.equal(countOf(bot, "spammer"), 0);
});

test("a contest channel gives no XP and no message count", async () => {
  const bot = createBot();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(bot.db, { ...ref, userId: "u" });
  setContestChannel(bot.db, ref, "room");
  await messageCreate(bot, message("accused", { channelId: "room" }));
  assert.equal(xpOf(bot, "accused"), 0);
  assert.equal(
    bot.db.prepare("SELECT COUNT(*) AS n FROM message_daily").get().n,
    0,
  );
});

test("a channel that is no longer a contest channel gives XP again", async () => {
  const bot = createBot();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(bot.db, { ...ref, userId: "u" });
  setContestChannel(bot.db, ref, "room");
  setContestChannel(bot.db, ref, null);
  await messageCreate(bot, message("cleared", { channelId: "room" }));
  assert.equal(xpOf(bot, "cleared"), 20);
});
