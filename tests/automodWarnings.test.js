const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { AutoModerationActionType } = require("discord.js");
const migrate = require("../loaders/migrate");
const { RULE_NAMES } = require("../utils/automodRules");
const {
  getRuleKey,
  warningReason,
  countWarnings,
  addAutomodWarning,
  warningNotice,
} = require("../utils/automodWarnings");
const autoModerationActionExecution = require("../events/autoModerationActionExecution");

const BOT = "bot";

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function warning(changes = {}) {
  return {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    botId: BOT,
    ruleKey: "spam",
    date: 1000,
    ...changes,
  };
}

function createBot() {
  const sent = [];
  let next = 0;
  const bot = {
    db: createDatabase(),
    user: { id: BOT },
    utils: { createId: async (prefix) => `${prefix}-${++next}` },
    users: { fetch: async () => ({ send: async (text) => sent.push(text) }) },
  };
  return { bot, sent };
}

function execution({
  type = AutoModerationActionType.BlockMessage,
  rule = { creatorId: BOT, name: RULE_NAMES.spam },
  userId = "u",
} = {}) {
  return {
    action: { type },
    autoModerationRule: rule,
    ruleId: "r",
    userId,
    guild: {
      id: "g",
      name: "Serveur",
      autoModerationRules: { fetch: async () => rule },
    },
  };
}

test("getRuleKey finds the rule Tsuki made", () => {
  assert.equal(getRuleKey(RULE_NAMES.words), "words");
  assert.equal(getRuleKey(RULE_NAMES.mentions), "mentions");
});

test("getRuleKey ignores other rules", () => {
  assert.equal(getRuleKey("Autre règle"), null);
});

test("warningReason names the rule", () => {
  assert.equal(warningReason("words"), "AutoMod : mot interdit");
  assert.equal(warningReason("spam"), "AutoMod : spam");
  assert.equal(warningReason("mentions"), "AutoMod : mentions de masse");
});

test("addAutomodWarning writes the warning with the bot as author", () => {
  const db = createDatabase();
  const result = addAutomodWarning(db, warning());
  assert.deepEqual(result, {
    id: "WARN-1",
    reason: "AutoMod : spam",
    total: 1,
  });
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM warns").get() },
    {
      id: "WARN-1",
      guild: "g",
      user: "u",
      author: BOT,
      reason: "AutoMod : spam",
      date: 1000,
    },
  );
});

test("addAutomodWarning counts every warning of the member", () => {
  const db = createDatabase();
  db.prepare(
    "INSERT INTO warns (id, guild, user, author, reason, date) VALUES ('M', 'g', 'u', 'mod', 'manual', 1)",
  ).run();
  assert.equal(addAutomodWarning(db, warning()).total, 2);
  assert.equal(countWarnings(db, "g", "u"), 2);
});

test("addAutomodWarning keeps guilds and members apart", () => {
  const db = createDatabase();
  addAutomodWarning(db, warning());
  const other = addAutomodWarning(db, warning({ id: "WARN-2", guildId: "h" }));
  assert.equal(other.total, 1);
  assert.equal(countWarnings(db, "g", "someone"), 0);
});

test("addAutomodWarning refuses an unknown rule", () => {
  assert.throws(
    () => addAutomodWarning(createDatabase(), warning({ ruleKey: "nope" })),
    TypeError,
  );
});

test("warningNotice names the server and the reason", () => {
  assert.equal(
    warningNotice("Serveur", "AutoMod : spam"),
    "Tu as reçu un avertissement automatique sur Serveur.\n> **Raison :** `AutoMod : spam`",
  );
});

test("a blocked message warns the member and tells them", async () => {
  const { bot, sent } = createBot();
  await autoModerationActionExecution(bot, execution());
  assert.equal(countWarnings(bot.db, "g", "u"), 1);
  assert.equal(bot.db.prepare("SELECT author FROM warns").get().author, BOT);
  assert.equal(sent.length, 1);
});

test("other actions of the same trigger do not warn twice", async () => {
  const { bot } = createBot();
  await autoModerationActionExecution(
    bot,
    execution({ type: AutoModerationActionType.SendAlertMessage }),
  );
  assert.equal(countWarnings(bot.db, "g", "u"), 0);
});

test("rules made by someone else do not warn", async () => {
  const { bot } = createBot();
  await autoModerationActionExecution(
    bot,
    execution({ rule: { creatorId: "someone", name: RULE_NAMES.spam } }),
  );
  await autoModerationActionExecution(
    bot,
    execution({ rule: { creatorId: BOT, name: "Autre règle" } }),
  );
  assert.equal(countWarnings(bot.db, "g", "u"), 0);
});

test("a member with closed DMs is still warned", async () => {
  const { bot } = createBot();
  bot.users.fetch = async () => ({
    send: async () => {
      throw new Error("closed");
    },
  });
  await autoModerationActionExecution(bot, execution());
  assert.equal(countWarnings(bot.db, "g", "u"), 1);
});
