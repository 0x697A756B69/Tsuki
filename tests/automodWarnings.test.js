const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { AutoModerationActionType } = require("discord.js");
const migrate = require("../loaders/migrate");
const { RULE_NAMES } = require("../utils/automodRules");
const { getRuleKey, ruleReason } = require("../utils/automodWarnings");
const { updateAutomodSettings } = require("../utils/automodSettings");
const { setLadder } = require("../utils/warnLadder");
const autoModerationActionExecution = require("../events/autoModerationActionExecution");

const BOT = "bot";

function createBot() {
  const sent = [];
  let next = 0;
  const db = new DatabaseSync(":memory:");
  migrate(db);
  const bot = {
    db,
    user: { id: BOT },
    utils: { createId: async (prefix) => `${prefix}-${++next}` },
    users: {
      fetch: async () => ({ id: "u", send: async (m) => sent.push(m) }),
    },
  };
  return { bot, sent };
}

function createMember(calls) {
  return {
    id: "u",
    moderatable: true,
    kickable: true,
    bannable: true,
    timeout: async (ms, reason) => {
      calls.push(["timeout", ms, reason]);
      return { communicationDisabledUntilTimestamp: 5_000 };
    },
    kick: async (reason) => calls.push(["kick", reason]),
  };
}

function execution({
  type = AutoModerationActionType.BlockMessage,
  rule = { creatorId: BOT, name: RULE_NAMES.spam },
  calls = [],
  member = createMember(calls),
  channel = null,
} = {}) {
  return {
    action: { type },
    autoModerationRule: rule,
    ruleId: "r",
    userId: "u",
    channelId: "c",
    guild: {
      id: "g",
      name: "Serveur",
      members: { fetch: async () => member },
      channels: { cache: new Map(channel ? [["c", channel]] : []) },
      autoModerationRules: { fetch: async () => rule },
      bans: {
        create: async (id, options) => calls.push(["ban", id, options.reason]),
      },
    },
  };
}

function warnRows(bot) {
  return bot.db.prepare("SELECT * FROM warns ORDER BY date, id").all();
}

test("getRuleKey finds the rule Tsuki made", () => {
  assert.equal(getRuleKey(RULE_NAMES.words), "words");
  assert.equal(getRuleKey(RULE_NAMES.mentions), "mentions");
});

test("getRuleKey ignores other rules", () => {
  assert.equal(getRuleKey("Autre règle"), null);
});

test("ruleReason reads the reason set for the rule", () => {
  const settings = {
    reasonWords: "Insultes",
    reasonSpam: "Spam",
    reasonMentions: "Mentions de masse",
  };
  assert.equal(ruleReason(settings, "words"), "Insultes");
  assert.equal(ruleReason(settings, "spam"), "Spam");
  assert.equal(ruleReason(settings, "mentions"), "Mentions de masse");
});

test("ruleReason refuses an unknown rule", () => {
  assert.throws(() => ruleReason({}, "nope"), TypeError);
});

test("a blocked message warns the member with the reason of the rule", async () => {
  const { bot } = createBot();
  updateAutomodSettings(bot.db, "g", { reasonSpam: "Flood" }, "admin");
  await autoModerationActionExecution(bot, execution());
  const [row] = warnRows(bot);
  assert.equal(row.author, BOT);
  assert.equal(row.reason, "Flood");
  assert.equal(row.sanction, null);
});

test("the private notice is an embed with the reason and the count", async () => {
  const { bot, sent } = createBot();
  await autoModerationActionExecution(bot, execution());
  assert.equal(sent.length, 1);
  const embed = sent[0].embeds[0].toJSON();
  assert.equal(embed.title, "Avertissement sur Serveur");
  assert.equal(embed.fields[0].value, "Spam");
  assert.match(embed.description, /C'est ton 1er avertissement actif\./);
  assert.match(
    embed.description,
    /Au 2e avertissement, tu seras en sourdine de 10 min\./,
  );
});

test("other actions of the same trigger do not warn twice", async () => {
  const { bot } = createBot();
  await autoModerationActionExecution(
    bot,
    execution({ type: AutoModerationActionType.SendAlertMessage }),
  );
  assert.equal(warnRows(bot).length, 0);
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
  assert.equal(warnRows(bot).length, 0);
});

test("the second warning times the member out as the ladder says", async () => {
  const { bot } = createBot();
  const calls = [];
  await autoModerationActionExecution(bot, execution({ calls }));
  assert.equal(calls.length, 0);
  await autoModerationActionExecution(bot, execution({ calls }));
  assert.deepEqual(calls, [["timeout", 600_000, "Avertissements actifs : 2"]]);
  const rows = warnRows(bot);
  const last = rows.find((row) => row.sanction !== null);
  assert.equal(last.sanction, "timeout");
  assert.equal(last.timeout_until, 5_000);
});

test("the ladder of the server replaces the default one", async () => {
  const { bot } = createBot();
  setLadder(bot.db, "g", [{ warns: 1, sanction: "kick", minutes: null }]);
  const calls = [];
  await autoModerationActionExecution(bot, execution({ calls }));
  assert.deepEqual(calls, [["kick", "Avertissements actifs : 1"]]);
  assert.equal(warnRows(bot)[0].sanction, "kick");
});

test("a ban step bans the member", async () => {
  const { bot } = createBot();
  setLadder(bot.db, "g", [{ warns: 1, sanction: "ban", minutes: null }]);
  const calls = [];
  await autoModerationActionExecution(bot, execution({ calls }));
  assert.deepEqual(calls, [["ban", "u", "Avertissements actifs : 1"]]);
  assert.equal(warnRows(bot)[0].sanction, "ban");
});

test("the last step keeps applying past its number", async () => {
  const { bot } = createBot();
  setLadder(bot.db, "g", [{ warns: 1, sanction: "timeout", minutes: 5 }]);
  const calls = [];
  await autoModerationActionExecution(bot, execution({ calls }));
  await autoModerationActionExecution(bot, execution({ calls }));
  assert.equal(calls.length, 2);
});

test("a member Tsuki cannot moderate is only warned", async () => {
  const { bot, sent } = createBot();
  const calls = [];
  const member = { ...createMember(calls), moderatable: false };
  await autoModerationActionExecution(bot, execution({ calls, member }));
  await autoModerationActionExecution(bot, execution({ calls, member }));
  assert.equal(calls.length, 0);
  assert.equal(warnRows(bot).length, 2);
  assert.equal(
    warnRows(bot).every((row) => row.sanction === null),
    true,
  );
  const second = sent[1].embeds[0].toJSON();
  assert.equal(second.fields[1].value, "Aucune sanction");
});

test("the notice names the sanction and its end", async () => {
  const { bot, sent } = createBot();
  const calls = [];
  await autoModerationActionExecution(bot, execution({ calls }));
  await autoModerationActionExecution(bot, execution({ calls }));
  const fields = sent[1].embeds[0].toJSON().fields;
  assert.equal(fields[1].value, "Sourdine de 10 min");
  assert.match(fields[2].value, /^<t:\d+:f>$/);
});

test("a warning expires after the valid days and stops counting", async () => {
  const { bot } = createBot();
  updateAutomodSettings(bot.db, "g", { warnValidDays: 1 }, "admin");
  bot.db
    .prepare(
      "INSERT INTO warns (id, guild, user, author, reason, date) VALUES ('OLD', 'g', 'u', 'mod', 'x', 1)",
    )
    .run();
  const calls = [];
  await autoModerationActionExecution(bot, execution({ calls }));
  assert.equal(calls.length, 0);
});

test("a member with closed DMs is still warned and the channel is told", async () => {
  const { bot } = createBot();
  bot.users.fetch = async () => ({
    id: "u",
    send: async () => {
      throw new Error("closed");
    },
  });
  const posted = [];
  const channel = {
    send: async (payload) => {
      posted.push(payload);
      return { delete: async () => {} };
    },
  };
  await autoModerationActionExecution(bot, execution({ channel }));
  assert.equal(warnRows(bot).length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posted.length, 1);
  assert.match(posted[0].content, /messages privés sont fermés/);
});
