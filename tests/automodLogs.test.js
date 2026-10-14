const test = require("node:test");
const assert = require("node:assert/strict");
const { AutoModerationActionType } = require("discord.js");
const { RULE_NAMES } = require("../utils/automod/automodRules");
const { updateAutomodSettings } = require("../utils/automod/automodSettings");
const {
  addLog,
  getLog,
  markContested,
  setContestChannel,
  isContestChannel,
  getExpiredLogs,
  deleteLog,
  sendLog,
  purgeLogs,
} = require("../utils/automod/automodLogs");
const { ACTION_ID } = require("../utils/automod/automodLogView");
const autoModerationActionExecution = require("../events/autoModerationActionExecution");
const { createDatabase } = require("./helpers/database");

const BOT = "bot";
const DAY = 24 * 60 * 60 * 1000;

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
  member = null,
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
      members: { fetch: async () => member },
      channels: { cache: new Map([["log", channel]]) },
      autoModerationRules: { fetch: async () => rule },
    },
  };
}

test("a blocked message log carries the warning for its buttons", async () => {
  const sent = [];
  const channel = logChannel(sent);
  const bot = createBot(channel);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(bot, execution({ channel }));
  const json = JSON.stringify(sent[0].components[0].toJSON());
  assert.match(json, new RegExp(`${ACTION_ID}:remove:u:WARN-1`));
});

test("logs are stored with identifiers and dates only", () => {
  const db = createDatabase();
  addLog(db, {
    guildId: "g",
    channelId: "log",
    messageId: "m",
    userId: "u",
    date: 5,
  });
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM automod_logs").get() },
    {
      guild: "g",
      channel: "log",
      message: "m",
      created_at: 5,
      user_id: "u",
      contested_at: null,
      contest_status: null,
      timeout_until: null,
      contest_channel: null,
      judged_by: null,
      judged_at: null,
      room_extra: 0,
      room_reminded: 0,
    },
  );
});

test("getLog reads the member and the contest state of a log", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u", date: 5 });
  assert.deepEqual(getLog(db, ref), {
    userId: "u",
    createdAt: 5,
    contestedAt: null,
    contestStatus: null,
    contestChannel: null,
    judgedBy: null,
    judgedAt: null,
  });
});

test("setContestChannel remembers the private channel of a contest", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u" });
  assert.equal(getLog(db, ref).contestChannel, null);
  setContestChannel(db, ref, "room");
  assert.equal(getLog(db, ref).contestChannel, "room");
});

test("isContestChannel recognises a contest channel of the same guild only", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u" });
  assert.equal(isContestChannel(db, "g", "room"), false);
  setContestChannel(db, ref, "room");
  assert.equal(isContestChannel(db, "g", "room"), true);
  assert.equal(isContestChannel(db, "g", "log"), false);
  assert.equal(isContestChannel(db, "other", "room"), false);
});

test("getLog is null for an unknown log", () => {
  assert.equal(
    getLog(createDatabase(), { guildId: "g", channelId: "c", messageId: "x" }),
    null,
  );
});

test("markContested accepts one contest per log", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u" });
  assert.equal(markContested(db, ref, 50), true);
  assert.equal(markContested(db, ref, 60), false);
  assert.equal(getLog(db, ref).contestedAt, 50);
  assert.equal(getLog(db, ref).contestStatus, "pending");
});

test("markContested ignores an unknown log", () => {
  assert.equal(
    markContested(createDatabase(), {
      guildId: "g",
      channelId: "c",
      messageId: "x",
    }),
    false,
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
    {
      guild: "g",
      channel: "log",
      message: "M-1",
      created_at: 1_000_000,
      user_id: "u",
      contested_at: null,
      contest_status: null,
      timeout_until: null,
      contest_channel: null,
      judged_by: null,
      judged_at: null,
      room_extra: 0,
      room_reminded: 0,
    },
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
  assert.match(JSON.stringify(sent[0].components[0].toJSON()), /\(1 actif\)/);
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

test("in observation the alert becomes a log, with no warning", async () => {
  const sent = [];
  const deleted = [];
  const channel = logChannel(sent, deleted);
  const bot = createBot(channel);
  updateAutomodSettings(
    bot.db,
    "g",
    { logChannel: "log", observation: true },
    "admin",
  );
  await autoModerationActionExecution(
    bot,
    execution({
      channel,
      type: AutoModerationActionType.SendAlertMessage,
      messageId: "m",
      alertSystemMessageId: "alert",
    }),
  );
  assert.equal(sent.length, 1);
  const json = JSON.stringify(sent[0].components[0].toJSON());
  assert.match(json, /Message détecté/);
  assert.match(json, /channels\/g\/c\/m/);
  assert.deepEqual(deleted, ["alert"]);
  assert.equal(bot.db.prepare("SELECT COUNT(*) AS n FROM warns").get().n, 0);
});

test("outside observation the alert is deleted but nothing is logged", async () => {
  const sent = [];
  const channel = logChannel(sent);
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
  assert.equal(sent.length, 0);
});
