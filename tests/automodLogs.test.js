const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { AutoModerationActionType, MessageFlags } = require("discord.js");
const migrate = require("../loaders/migrate");
const { RULE_NAMES } = require("../utils/automodRules");
const { updateAutomodSettings } = require("../utils/automodSettings");
const {
  EXCERPT_LENGTH,
  RETENTION,
  logTitle,
  excerpt,
  buildLogMessage,
  addLog,
  getExpiredLogs,
  deleteLog,
  sendLog,
  purgeLogs,
} = require("../utils/automodLogs");
const autoModerationActionExecution = require("../events/autoModerationActionExecution");

const BOT = "bot";
const DAY = 24 * 60 * 60 * 1000;

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function data(changes = {}) {
  return {
    ruleKey: "words",
    ruleName: RULE_NAMES.words,
    userId: "u",
    channelId: "c",
    warningTotal: 2,
    content: "gros mot",
    date: 1_000_000,
    ...changes,
  };
}

function render(changes) {
  return JSON.stringify(buildLogMessage(data(changes)).components[0].toJSON());
}

function logChannel(sent = [], deleted = []) {
  return {
    id: "log",
    isTextBased: () => true,
    send: async (message) => {
      sent.push(message);
      return { id: `M-${sent.length}` };
    },
    messages: { delete: async (id) => deleted.push(id) },
  };
}

function createBot(channel = logChannel()) {
  return {
    db: createDatabase(),
    user: { id: BOT },
    utils: { createId: async (prefix) => `${prefix}-1` },
    users: { fetch: async () => ({ send: async () => {} }) },
    channels: { fetch: async () => channel },
  };
}

function execution({
  type = AutoModerationActionType.BlockMessage,
  channel = logChannel(),
  matchedContent = "gros mot",
  messageId = "",
  alertSystemMessageId = "",
} = {}) {
  const rule = { creatorId: BOT, name: RULE_NAMES.words };
  return {
    action: { type },
    autoModerationRule: rule,
    ruleId: "r",
    userId: "u",
    channelId: "c",
    messageId,
    alertSystemMessageId,
    matchedContent,
    content: "phrase avec un gros mot",
    guild: {
      id: "g",
      name: "Serveur",
      members: { fetch: async () => null },
      channels: { cache: new Map([["log", channel]]) },
      autoModerationRules: { fetch: async () => rule },
    },
  };
}

test("logTitle names the blocked rule", () => {
  assert.equal(logTitle("words"), "Message bloqué : mot interdit");
  assert.equal(logTitle("mentions"), "Message bloqué : mentions de masse");
});

test("excerpt keeps a short text as one line", () => {
  assert.equal(excerpt("  un  \n mot  "), "un mot");
});

test("excerpt cuts at 200 characters", () => {
  const result = excerpt("a".repeat(500));
  assert.equal(result.length, EXCERPT_LENGTH);
  assert.ok(result.endsWith("…"));
  assert.equal(excerpt("a".repeat(EXCERPT_LENGTH)).length, EXCERPT_LENGTH);
});

test("excerpt is null without text", () => {
  assert.equal(excerpt(""), null);
  assert.equal(excerpt("  \n "), null);
  assert.equal(excerpt(undefined), null);
});

test("buildLogMessage is a silent components v2 panel", () => {
  const message = buildLogMessage(data());
  assert.equal(message.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.equal(message.components.length, 1);
});

test("buildLogMessage shows member, channel, rule, action and quote", () => {
  const json = render();
  assert.match(json, /Message bloqué : mot interdit/);
  assert.match(json, /<@u>/);
  assert.match(json, /<#c>/);
  assert.match(json, new RegExp(RULE_NAMES.words));
  assert.match(json, /bloqué, avertissement ajouté \(2 au total\)/);
  assert.match(json, /> gros mot/);
});

test("buildLogMessage links the message only when it exists", () => {
  assert.doesNotMatch(render(), /Aller au message/);
  assert.match(
    render({ messageUrl: "https://discord.com/channels/g/c/m" }),
    /\[Aller au message\]\(https:\/\/discord\.com\/channels\/g\/c\/m\)/,
  );
});

test("buildLogMessage skips the quote when there is no text", () => {
  assert.doesNotMatch(render({ content: "" }), /> /);
});

test("buildLogMessage announces the purge date 30 days later", () => {
  const expected = Math.floor((1_000_000 + RETENTION) / 1000);
  assert.match(render(), new RegExp(`<t:${expected}:D>`));
});

test("logs are stored with channel, message and date only", () => {
  const db = createDatabase();
  addLog(db, { guildId: "g", channelId: "log", messageId: "m", date: 5 });
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM automod_logs").get() },
    { guild: "g", channel: "log", message: "m", created_at: 5 },
  );
});

test("getExpiredLogs returns only logs older than 30 days", () => {
  const db = createDatabase();
  const now = 100 * DAY;
  for (const { messageId, age } of [
    { messageId: "old", age: 31 },
    { messageId: "edge", age: 30 },
    { messageId: "new", age: 29 },
  ])
    addLog(db, {
      guildId: "g",
      channelId: "c",
      messageId,
      date: now - age * DAY,
    });
  assert.deepEqual(
    getExpiredLogs(db, now)
      .map((log) => log.messageId)
      .sort(),
    ["edge", "old"],
  );
});

test("getExpiredLogs honours the limit", () => {
  const db = createDatabase();
  for (const id of ["a", "b", "c"])
    addLog(db, { guildId: "g", channelId: "c", messageId: id, date: 1 });
  assert.equal(getExpiredLogs(db, 100 * DAY, 2).length, 2);
});

test("deleteLog removes the row", () => {
  const db = createDatabase();
  addLog(db, { guildId: "g", channelId: "c", messageId: "m", date: 1 });
  deleteLog(db, { guildId: "g", channelId: "c", messageId: "m" });
  assert.equal(getExpiredLogs(db, 100 * DAY).length, 0);
});

test("sendLog posts the panel and remembers it", async () => {
  const sent = [];
  const bot = createBot();
  const guild = {
    id: "g",
    channels: { cache: new Map([["log", logChannel(sent)]]) },
  };
  const message = await sendLog(bot, guild, "log", data());
  assert.equal(message.id, "M-1");
  assert.equal(sent.length, 1);
  assert.deepEqual(
    { ...bot.db.prepare("SELECT * FROM automod_logs").get() },
    { guild: "g", channel: "log", message: "M-1", created_at: 1_000_000 },
  );
});

test("sendLog does nothing without a usable channel", async () => {
  const bot = createBot();
  const guild = { id: "g", channels: { cache: new Map() } };
  assert.equal(await sendLog(bot, guild, null, data()), null);
  assert.equal(await sendLog(bot, guild, "log", data()), null);
  assert.equal(bot.db.prepare("SELECT * FROM automod_logs").get(), undefined);
});

test("sendLog stores nothing when sending fails", async () => {
  const bot = createBot();
  const channel = logChannel();
  channel.send = async () => {
    throw new Error("missing access");
  };
  const guild = { id: "g", channels: { cache: new Map([["log", channel]]) } };
  assert.equal(await sendLog(bot, guild, "log", data()), null);
  assert.equal(bot.db.prepare("SELECT * FROM automod_logs").get(), undefined);
});

test("purgeLogs deletes expired messages and rows", async () => {
  const deleted = [];
  const bot = createBot(logChannel([], deleted));
  const now = 100 * DAY;
  addLog(bot.db, {
    guildId: "g",
    channelId: "log",
    messageId: "old",
    date: now - 31 * DAY,
  });
  addLog(bot.db, {
    guildId: "g",
    channelId: "log",
    messageId: "new",
    date: now - DAY,
  });
  assert.equal(await purgeLogs(bot, now), 1);
  assert.deepEqual(deleted, ["old"]);
  assert.deepEqual(
    bot.db
      .prepare("SELECT message FROM automod_logs")
      .all()
      .map((row) => row.message),
    ["new"],
  );
});

test("purgeLogs forgets a log whose channel or message is gone", async () => {
  const bot = createBot();
  bot.channels.fetch = async () => {
    throw new Error("unknown channel");
  };
  addLog(bot.db, { guildId: "g", channelId: "log", messageId: "old", date: 1 });
  assert.equal(await purgeLogs(bot, 100 * DAY), 1);
  assert.equal(bot.db.prepare("SELECT * FROM automod_logs").get(), undefined);

  const channel = logChannel();
  channel.messages.delete = async () => {
    throw new Error("unknown message");
  };
  const other = createBot(channel);
  addLog(other.db, {
    guildId: "g",
    channelId: "log",
    messageId: "old",
    date: 1,
  });
  await purgeLogs(other, 100 * DAY);
  assert.equal(other.db.prepare("SELECT * FROM automod_logs").get(), undefined);
});

test("a blocked message is logged in the log channel", async () => {
  const sent = [];
  const channel = logChannel(sent);
  const bot = createBot(channel);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(bot, execution({ channel }));
  assert.equal(sent.length, 1);
  assert.match(
    JSON.stringify(sent[0].components[0].toJSON()),
    /\(1 au total\)/,
  );
  assert.equal(
    bot.db.prepare("SELECT COUNT(*) AS n FROM automod_logs").get().n,
    1,
  );
});

test("a blocked message is not logged without a log channel", async () => {
  const sent = [];
  const channel = logChannel(sent);
  const bot = createBot(channel);
  await autoModerationActionExecution(bot, execution({ channel }));
  assert.equal(sent.length, 0);
});

test("the native alert is deleted once a log channel is set", async () => {
  const deleted = [];
  const channel = logChannel([], deleted);
  const bot = createBot(channel);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(
    bot,
    execution({
      channel,
      type: AutoModerationActionType.SendAlertMessage,
      alertSystemMessageId: "alert",
    }),
  );
  assert.deepEqual(deleted, ["alert"]);
  assert.equal(bot.db.prepare("SELECT COUNT(*) AS n FROM warns").get().n, 0);
});
