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
  blockedNotice,
  escalationNotice,
} = require("../utils/automodWarnings");
const autoModerationActionExecution = require("../events/autoModerationActionExecution");

const { updateAutomodSettings } = require("../utils/automodSettings");
const { addLog } = require("../utils/automodLogs");

const BOT = "bot";
const DAY = 24 * 60 * 60 * 1000;

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
  const timeouts = [];
  let next = 0;
  const bot = {
    db: createDatabase(),
    user: { id: BOT },
    utils: { createId: async (prefix) => `${prefix}-${++next}` },
    timeouts,
    users: { fetch: async () => ({ send: async (text) => sent.push(text) }) },
  };
  return { bot, sent, timeouts };
}

function execution({
  type = AutoModerationActionType.BlockMessage,
  rule = { creatorId: BOT, name: RULE_NAMES.spam },
  userId = "u",
  moderatable = true,
  joinedTimestamp = null,
  timeouts = [],
} = {}) {
  return {
    action: { type },
    autoModerationRule: rule,
    ruleId: "r",
    userId,
    guild: {
      id: "g",
      name: "Serveur",
      members: {
        fetch: async () => ({
          moderatable,
          joinedTimestamp,
          timeout: async (ms, reason) => timeouts.push([ms, reason]),
        }),
      },
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

test("blockedNotice names the server, the rule, the count and the score", () => {
  assert.equal(
    blockedNotice(
      "Serveur",
      "words",
      { total: 2, score: 4.5 },
      {
        sensitivity: 0,
        escalationMinutes: 10,
      },
    ),
    "Ton message a été bloqué sur Serveur.\n**Règle :** mot interdit\n**Avertissements :** 2.\n**Score :** 4,5.",
  );
});

test("blockedNotice announces the next sanction below the threshold", () => {
  const settings = { sensitivity: 6, escalationMinutes: 10 };
  assert.equal(
    blockedNotice("Serveur", "spam", { total: 2, score: 3 }, settings),
    "Ton message a été bloqué sur Serveur.\n**Règle :** spam\n**Avertissements :** 2.\n**Score :** 3 sur 6, à 6, tu seras mis en sourdine 10 minutes.",
  );
  assert.match(
    blockedNotice(
      "Serveur",
      "spam",
      { total: 1, score: 1 },
      { ...settings, escalationMinutes: 1 },
    ),
    /sourdine 1 minute\./,
  );
});

test("blockedNotice stops announcing once the threshold is reached", () => {
  const settings = { sensitivity: 6, escalationMinutes: 10 };
  assert.equal(
    blockedNotice(
      "Serveur",
      "mentions",
      { total: 3, score: 6 },
      settings,
    ).endsWith("**Score :** 6."),
    true,
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

test("escalationNotice pluralises the minutes", () => {
  assert.equal(
    escalationNotice("Serveur", 1),
    "Tu as été mis en sourdine 1 minute sur Serveur : ton score de risque est trop élevé.",
  );
  assert.match(escalationNotice("Serveur", 60), /60 minutes/);
});

test("the warning at the threshold times the member out", async () => {
  const { bot, sent, timeouts } = createBot();
  updateAutomodSettings(
    bot.db,
    "g",
    { sensitivity: 2, escalationMinutes: 10 },
    "admin",
  );
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.equal(timeouts.length, 0);
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.deepEqual(timeouts, [[600000, "AutoMod : score de risque 2"]]);
  assert.equal(sent.length, 3);
});

test("a member Tsuki cannot moderate is only warned", async () => {
  const { bot, sent, timeouts } = createBot();
  updateAutomodSettings(bot.db, "g", { sensitivity: 1 }, "admin");
  await autoModerationActionExecution(
    bot,
    execution({ timeouts, moderatable: false }),
  );
  assert.equal(timeouts.length, 0);
  assert.equal(countWarnings(bot.db, "g", "u"), 1);
  assert.equal(sent.length, 1);
});

function pastInfraction(db, points, daysAgo) {
  addLog(db, {
    guildId: "g",
    channelId: "log",
    messageId: `old-${points}-${daysAgo}`,
    userId: "u",
    points,
    trust: 1,
    date: Date.now() - daysAgo * DAY,
  });
}

test("an infraction without a log channel still counts for the score", async () => {
  const { bot } = createBot();
  await autoModerationActionExecution(bot, execution());
  const row = { ...bot.db.prepare("SELECT * FROM automod_logs").get() };
  assert.equal(row.channel, "-");
  assert.equal(row.message, "WARN-1");
  assert.equal(row.user_id, "u");
  assert.equal(row.points, 1);
  assert.equal(row.trust, 1);
});

test("the score adds the infractions of the last days", async () => {
  const { bot, timeouts } = createBot();
  updateAutomodSettings(bot.db, "g", { sensitivity: 3 }, "admin");
  pastInfraction(bot.db, 4, 3);
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.deepEqual(timeouts, [[3600000, "AutoMod : score de risque 3"]]);
});

test("an old infraction fades away before the threshold", async () => {
  const { bot, timeouts } = createBot();
  updateAutomodSettings(bot.db, "g", { sensitivity: 3 }, "admin");
  pastInfraction(bot.db, 4, 6);
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.equal(timeouts.length, 0);
});

test("a very old infraction is not counted at all", async () => {
  const { bot, timeouts } = createBot();
  updateAutomodSettings(
    bot.db,
    "g",
    { sensitivity: 3, halfLifeDays: 30 },
    "admin",
  );
  pastInfraction(bot.db, 20, 31);
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.equal(timeouts.length, 0);
});

test("the half-life of the server sets how fast the score fades", async () => {
  const { bot, timeouts } = createBot();
  updateAutomodSettings(
    bot.db,
    "g",
    { sensitivity: 3, halfLifeDays: 1 },
    "admin",
  );
  pastInfraction(bot.db, 4, 3);
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.equal(timeouts.length, 0);
});

test("a sensitivity of zero never times the member out", async () => {
  const { bot, timeouts } = createBot();
  updateAutomodSettings(bot.db, "g", { sensitivity: 0 }, "admin");
  pastInfraction(bot.db, 20, 0);
  await autoModerationActionExecution(bot, execution({ timeouts }));
  assert.equal(timeouts.length, 0);
});

test("a member who just arrived reaches the threshold sooner", async () => {
  const { bot, timeouts } = createBot();
  updateAutomodSettings(bot.db, "g", { sensitivity: 3 }, "admin");
  const rule = { creatorId: BOT, name: RULE_NAMES.words };
  await autoModerationActionExecution(
    bot,
    execution({ rule, timeouts, joinedTimestamp: Date.now() - DAY }),
  );
  assert.deepEqual(timeouts, [[3600000, "AutoMod : score de risque 3"]]);
});

test("the private notice tells the score and the threshold", async () => {
  const { bot, sent } = createBot();
  await autoModerationActionExecution(bot, execution());
  assert.match(
    sent[0].content,
    /\*\*Score :\*\* 1 sur 6, à 6, tu seras mis en sourdine 60 minutes\./,
  );
});

test("the private notice stops announcing when the threshold is reached", async () => {
  const { bot, sent } = createBot();
  updateAutomodSettings(bot.db, "g", { sensitivity: 1 }, "admin");
  await autoModerationActionExecution(bot, execution());
  assert.match(sent[0].content, /\*\*Score :\*\* 1\.$/);
});
