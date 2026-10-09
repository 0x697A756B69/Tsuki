const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const {
  AutoModerationActionType,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const migrate = require("../loaders/migrate");
const { RULE_NAMES } = require("../utils/automodRules");
const { updateAutomodSettings } = require("../utils/automodSettings");
const {
  ACTION_ID,
  EXCERPT_LENGTH,
  RETENTION,
  logTitle,
  excerpt,
  buildLogMessage,
  markResolved,
  addLog,
  getLog,
  setLogTimeout,
  clearLogPoints,
  markContested,
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

test("logTitle names the blocked rule", () => {
  assert.equal(logTitle("words"), "Message bloqué : mot interdit");
  assert.equal(logTitle("mentions"), "Message bloqué : mentions de masse");
});

test("logTitle says detected instead of blocked in observation", () => {
  assert.equal(logTitle("spam", true), "Message détecté : spam");
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

function buttons(changes) {
  const container = buildLogMessage(data(changes)).components[0].toJSON();
  const row = container.components.find((part) => part.type === 1);
  return row ? /** @type {any[]} */ (row.components) : [];
}

test("a blocked log offers remove, timeout, ban and close", () => {
  const row = buttons({ warningId: "WARN-1" });
  assert.deepEqual(
    row.map((button) => button.custom_id),
    [
      `${ACTION_ID}:remove:u:WARN-1`,
      `${ACTION_ID}:timeout:u`,
      `${ACTION_ID}:ban:u`,
      `${ACTION_ID}:close`,
    ],
  );
  assert.deepEqual(
    row.map((button) => button.label),
    ["Retirer l'avertissement", "Mettre en sourdine", "Bannir", "Classer"],
  );
  assert.equal(row[2].style, ButtonStyle.Danger);
});

test("a blocked log without a warning cannot remove one", () => {
  const ids = buttons().map((button) => button.custom_id);
  assert.equal(
    ids.some((id) => id.includes(":remove:")),
    false,
  );
  assert.equal(ids.length, 3);
});

test("an observed log offers delete, warn and close", () => {
  const row = buttons({ observed: true, messageId: "m" });
  assert.deepEqual(
    row.map((button) => button.custom_id),
    [`${ACTION_ID}:delete:c:m`, `${ACTION_ID}:warn:u`, `${ACTION_ID}:close`],
  );
  assert.deepEqual(
    row.map((button) => button.label),
    ["Supprimer le message", "Avertir", "Classer"],
  );
});

test("an observed log without a message cannot delete it", () => {
  const ids = buttons({ observed: true }).map((button) => button.custom_id);
  assert.deepEqual(ids, [`${ACTION_ID}:warn:u`, `${ACTION_ID}:close`]);
});

test("a handled log loses its buttons and shows who handled it", () => {
  const resolved = {
    moderatorId: "mod",
    label: "avertissement retiré",
    date: 2_000_000,
  };
  assert.deepEqual(buttons({ resolved }), []);
  const json = render({ resolved });
  assert.match(json, /Traité par <@mod> : avertissement retiré, le <t:2000:f>/);
  assert.match(json, /Supprimé de ce salon le/);
  assert.match(json, new RegExp(String(0x8e8e93)));
});

test("markResolved turns a live panel into the handled one", () => {
  const resolved = { moderatorId: "mod", label: "classé", date: 2_000_000 };
  const live = buildLogMessage(data({ warningId: "WARN-1" })).components[0];
  const handled = markResolved(live.toJSON(), resolved);
  const expected = buildLogMessage(data({ resolved }));
  assert.equal(handled.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(handled.allowedMentions, { parse: [] });
  assert.deepEqual(handled.components[0], expected.components[0].toJSON());
});

test("a blocked message log carries the warning for its buttons", async () => {
  const sent = [];
  const channel = logChannel(sent);
  const bot = createBot(channel);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(bot, execution({ channel }));
  const json = JSON.stringify(sent[0].components[0].toJSON());
  assert.match(json, new RegExp(`${ACTION_ID}:remove:u:WARN-1`));
});

test("a blocked log shows the score, the threshold and its detail", () => {
  const json = render({ score: 4.5, threshold: 6, points: 3, trust: 1.5 });
  assert.match(json, /\*\*Score :\*\* 4,5 \/ 6 \(3 × 1,5\)/);
});

test("a log leaves the threshold out when the muting is off", () => {
  const json = render({ score: 3, threshold: 0, points: 3, trust: 1 });
  assert.match(json, /\*\*Score :\*\* 3 \(3 × 1\)/);
});

test("an observed or unscored log has no score line", () => {
  assert.doesNotMatch(
    render({ observed: true, score: 3, threshold: 6, points: 3, trust: 1 }),
    /Score/,
  );
  assert.doesNotMatch(render(), /Score/);
});

test("a block posts the score of the member in the log", async () => {
  const sent = [];
  const channel = logChannel(sent);
  const bot = createBot(channel);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(bot, execution({ channel }));
  assert.match(
    JSON.stringify(sent[0].components[0].toJSON()),
    /Score :\*\* 2 \/ 6 \(2 × 1\)/,
  );
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
      points: null,
      trust: null,
    },
  );
});

test("getLog reads the member and the contest state of a log", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u", timeoutUntil: 9, date: 5 });
  assert.deepEqual(getLog(db, ref), {
    userId: "u",
    createdAt: 5,
    contestedAt: null,
    contestStatus: null,
    timeoutUntil: 9,
    points: null,
    trust: null,
  });
});

test("getLog is null for an unknown log", () => {
  assert.equal(
    getLog(createDatabase(), { guildId: "g", channelId: "c", messageId: "x" }),
    null,
  );
});

test("setLogTimeout notes when the timeout ends", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u" });
  setLogTimeout(db, ref, 123);
  assert.equal(getLog(db, ref).timeoutUntil, 123);
});

test("clearLogPoints empties the risk of one log only", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  const other = { ...ref, messageId: "n" };
  addLog(db, { ...ref, userId: "u", points: 2, trust: 1.5 });
  addLog(db, { ...other, userId: "u", points: 3, trust: 1 });
  clearLogPoints(db, ref);
  assert.equal(getLog(db, ref).points, null);
  assert.equal(getLog(db, ref).trust, null);
  assert.equal(getLog(db, other).points, 3);
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
  const message = await sendLog(
    bot,
    guild,
    "log",
    data({ points: 2, trust: 1.5 }),
  );
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
      points: 2,
      trust: 1.5,
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

test("an observed message is logged in yellow without sanction", () => {
  const json = render({
    observed: true,
    messageUrl: "https://discord.com/channels/g/c/m",
  });
  assert.match(json, /Message détecté : mot interdit/);
  assert.match(json, /observation, aucune sanction/);
  assert.match(json, /Aller au message/);
  assert.doesNotMatch(json, /avertissement ajouté/);
  assert.notEqual(
    buildLogMessage(data({ observed: true })).components[0].toJSON()
      .accent_color,
    buildLogMessage(data()).components[0].toJSON().accent_color,
  );
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

test("a timeout is noted in the log with the exact end", async () => {
  const channel = logChannel();
  const bot = createBot(channel);
  updateAutomodSettings(
    bot.db,
    "g",
    { logChannel: "log", sensitivity: 2 },
    "admin",
  );
  const member = {
    moderatable: true,
    timeout: async () => ({ communicationDisabledUntilTimestamp: 777 }),
  };
  await autoModerationActionExecution(bot, execution({ channel, member }));
  const ref = { guildId: "g", channelId: "log", messageId: "M-1" };
  assert.equal(getLog(bot.db, ref).userId, "u");
  assert.equal(getLog(bot.db, ref).timeoutUntil, 777);
});

test("a log notes no timeout when the member is only warned", async () => {
  const channel = logChannel();
  const bot = createBot(channel);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(bot, execution({ channel }));
  const ref = { guildId: "g", channelId: "log", messageId: "M-1" };
  assert.equal(getLog(bot.db, ref).userId, "u");
  assert.equal(getLog(bot.db, ref).timeoutUntil, null);
});

test("addLog freezes the points and the trust of the infraction", () => {
  const db = createDatabase();
  const ref = { guildId: "g", channelId: "log", messageId: "m" };
  addLog(db, { ...ref, userId: "u", points: 3, trust: 0.5, date: 5 });
  const log = getLog(db, ref);
  assert.equal(log.points, 3);
  assert.equal(log.trust, 0.5);
});

test("the database rejects points and trust out of range", () => {
  const db = createDatabase();
  for (const [index, changes] of [
    { points: 0 },
    { points: 21 },
    { trust: 0 },
    { trust: -1 },
  ].entries())
    assert.throws(() =>
      addLog(db, {
        guildId: "g",
        channelId: "log",
        messageId: `m${index}`,
        ...changes,
      }),
    );
  assert.equal(db.prepare("SELECT * FROM automod_logs").get(), undefined);
});
