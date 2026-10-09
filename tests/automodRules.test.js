const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AutoModerationActionType,
  AutoModerationRuleTriggerType,
} = require("discord.js");
const { RULE_NAMES, buildRules, syncRules } = require("../utils/automodRules");

const BOT = "bot";

function config(changes = {}) {
  return {
    words: [],
    spam: false,
    mentions: false,
    mentionLimit: 5,
    exemptRoles: [],
    exemptChannels: [],
    logChannel: null,
    observation: false,
    ...changes,
  };
}

function fakeGuild(rules = []) {
  const calls = { created: [], edited: [], deleted: [] };
  const existing = rules.map(({ name, creatorId = BOT }, index) => ({
    id: String(index),
    name,
    creatorId,
    edit: async (payload) => calls.edited.push([name, payload]),
    delete: async (reason) => calls.deleted.push([name, reason]),
  }));
  const guild = {
    client: { user: { id: BOT } },
    autoModerationRules: {
      fetch: async () => new Map(existing.map((rule) => [rule.id, rule])),
      create: async (payload) => calls.created.push(payload),
    },
  };
  return { guild, calls };
}

test("buildRules returns nothing when everything is off", () => {
  assert.deepEqual(buildRules(config()), []);
});

test("buildRules cleans the forbidden words", () => {
  const [rule] = buildRules(config({ words: [" Foo ", "foo", "", "BAR"] }));

  assert.equal(rule.name, RULE_NAMES.words);
  assert.equal(rule.triggerType, AutoModerationRuleTriggerType.Keyword);
  assert.deepEqual(rule.triggerMetadata.keywordFilter, ["foo", "bar"]);
});

test("buildRules builds the spam and mention rules", () => {
  const rules = buildRules(
    config({ spam: true, mentions: true, mentionLimit: 8 }),
  );

  assert.deepEqual(
    rules.map((rule) => rule.key),
    ["spam", "mentions"],
  );
  assert.equal(rules[1].triggerMetadata.mentionTotalLimit, 8);
});

test("buildRules always blocks the message", () => {
  const [rule] = buildRules(config({ spam: true }));

  assert.deepEqual(
    rule.actions.map((action) => action.type),
    [AutoModerationActionType.BlockMessage],
  );
  assert.ok(rule.actions[0].metadata.customMessage.length <= 150);
});

test("buildRules explains each rule in its own block message", () => {
  const rules = buildRules(
    config({ words: ["a"], spam: true, mentions: true }),
  );
  const messages = rules.map((rule) => rule.actions[0].metadata.customMessage);

  assert.equal(new Set(messages).size, 3);
  for (const message of messages) assert.ok(message.length <= 150);
  assert.match(messages[0], /mot interdit/);
  assert.match(messages[1], /spam/);
  assert.match(messages[2], /mentions/);
});

test("buildRules alerts the log channel when there is one", () => {
  const [rule] = buildRules(config({ spam: true, logChannel: "42" }));

  assert.deepEqual(rule.actions[1], {
    type: AutoModerationActionType.SendAlertMessage,
    metadata: { channel: "42" },
  });
});

test("buildRules keeps the exemptions within Discord's limits", () => {
  const roles = Array.from({ length: 30 }, (_, index) => String(index));
  const channels = Array.from({ length: 60 }, (_, index) => String(index));
  const [rule] = buildRules(
    config({ spam: true, exemptRoles: roles, exemptChannels: channels }),
  );

  assert.equal(rule.exemptRoles.length, 20);
  assert.equal(rule.exemptChannels.length, 50);
});

test("syncRules creates the missing rules", async () => {
  const { guild, calls } = fakeGuild();
  const result = await syncRules(guild, config({ spam: true }), "why");

  assert.deepEqual(result, { created: ["spam"], updated: [], deleted: [] });
  assert.equal(calls.created[0].name, RULE_NAMES.spam);
  assert.equal(calls.created[0].reason, "why");
  assert.equal("key" in calls.created[0], false);
});

test("syncRules updates the rules Tsuki already made", async () => {
  const { guild, calls } = fakeGuild([{ name: RULE_NAMES.spam }]);
  const result = await syncRules(guild, config({ spam: true }), "why");

  assert.deepEqual(result, { created: [], updated: ["spam"], deleted: [] });
  assert.equal(calls.created.length, 0);
  assert.equal(calls.edited[0][1].reason, "why");
});

test("syncRules deletes the rules that are turned off", async () => {
  const { guild, calls } = fakeGuild([{ name: RULE_NAMES.mentions }]);
  const result = await syncRules(guild, config(), "why");

  assert.deepEqual(result, { created: [], updated: [], deleted: ["mentions"] });
  assert.deepEqual(calls.deleted, [[RULE_NAMES.mentions, "why"]]);
});

test("syncRules leaves other people's rules alone", async () => {
  const { guild, calls } = fakeGuild([
    { name: RULE_NAMES.spam, creatorId: "someone" },
    { name: "Autre règle" },
  ]);
  const result = await syncRules(guild, config(), "why");

  assert.deepEqual(result, { created: [], updated: [], deleted: [] });
  assert.equal(calls.deleted.length, 0);
});

test("observation keeps only the alert, no blocking", () => {
  const [rule] = buildRules(
    config({ spam: true, logChannel: "42", observation: true }),
  );
  assert.deepEqual(
    rule.actions.map((action) => action.type),
    [AutoModerationActionType.SendAlertMessage],
  );
});

test("observation without a log channel still blocks", () => {
  const [rule] = buildRules(config({ spam: true, observation: true }));
  assert.deepEqual(
    rule.actions.map((action) => action.type),
    [AutoModerationActionType.BlockMessage],
  );
});
