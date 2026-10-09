const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { AutoModerationActionType, ComponentType } = require("discord.js");
const migrate = require("../loaders/migrate");
const { RULE_NAMES } = require("../utils/automodRules");
const { updateAutomodSettings } = require("../utils/automodSettings");
const { buildLogMessage, getLog } = require("../utils/automodLogs");
const {
  CONTEST_ID,
  CONTEST_COLOR,
  REASON_LENGTH,
  contestRow,
  contestCheck,
  renderContestModal,
  parseReason,
  contestedPayload,
} = require("../utils/automodContest");
const autoModerationActionExecution = require("../events/autoModerationActionExecution");

const HOUR = 60 * 60 * 1000;
const REF = { guildId: "g", channelId: "log", messageId: "m" };
const SETTINGS = { contestHours: 168 };

function log(changes = {}) {
  return {
    userId: "u",
    createdAt: 1_000,
    contestedAt: null,
    contestStatus: null,
    timeoutUntil: null,
    ...changes,
  };
}

function panel() {
  return buildLogMessage({
    ruleKey: "words",
    ruleName: RULE_NAMES.words,
    userId: "u",
    channelId: "c",
    warningTotal: 1,
    warningId: "WARN-1",
    content: "gros mot",
  }).components[0].toJSON();
}

test("contestRow offers one button that names the log", () => {
  const json = JSON.parse(JSON.stringify(contestRow(REF)));
  assert.equal(json.components.length, 1);
  assert.equal(json.components[0].label, "Contester");
  assert.equal(json.components[0].custom_id, `${CONTEST_ID}:ask:g:log:m`);
});

test("contestCheck lets the blocked member contest inside the window", () => {
  assert.equal(
    contestCheck({ log: log(), settings: SETTINGS, userId: "u", now: 2_000 }),
    null,
  );
});

test("contestCheck refuses when contesting is turned off", () => {
  assert.match(
    contestCheck({
      log: log(),
      settings: { contestHours: 0 },
      userId: "u",
      now: 2_000,
    }),
    /pas disponible/,
  );
});

test("contestCheck refuses an unknown log", () => {
  assert.match(
    contestCheck({ log: null, settings: SETTINGS, userId: "u" }),
    /pas disponible/,
  );
});

test("contestCheck refuses another member", () => {
  assert.match(
    contestCheck({ log: log(), settings: SETTINGS, userId: "x", now: 2_000 }),
    /ne te concerne pas/,
  );
});

test("contestCheck refuses a second contest", () => {
  assert.match(
    contestCheck({
      log: log({ contestedAt: 1_500 }),
      settings: SETTINGS,
      userId: "u",
      now: 2_000,
    }),
    /déjà contesté/,
  );
});

test("contestCheck refuses once the window is over", () => {
  const settings = { contestHours: 2 };
  assert.equal(
    contestCheck({
      log: log(),
      settings,
      userId: "u",
      now: 1_000 + 2 * HOUR,
    }),
    null,
  );
  assert.match(
    contestCheck({
      log: log(),
      settings,
      userId: "u",
      now: 1_001 + 2 * HOUR,
    }),
    /délai/,
  );
});

test("the contest modal carries the log and an optional reason", () => {
  const json = JSON.parse(JSON.stringify(renderContestModal(REF)));
  assert.equal(json.custom_id, `${CONTEST_ID}:send:g:log:m`);
  const input = json.components[0].component;
  assert.equal(input.custom_id, "reason");
  assert.equal(input.required, false);
  assert.equal(input.max_length, REASON_LENGTH);
});

test("parseReason trims and treats blank as no reason", () => {
  assert.equal(parseReason("  oups  "), "oups");
  assert.equal(parseReason("   "), null);
  assert.equal(parseReason(undefined), null);
});

test("parseReason cuts at 300 characters", () => {
  assert.equal(parseReason("a".repeat(400)).length, REASON_LENGTH);
});

test("contestedPayload turns the log violet and quotes the reason", () => {
  const payload = contestedPayload(panel(), { reason: "faux positif\nmerci" });
  const container = payload.components[0];
  const json = JSON.stringify(container);
  assert.equal(container.accent_color, CONTEST_COLOR);
  assert.match(json, /Blocage contesté : mot interdit/);
  assert.match(json, /> faux positif\\n> merci/);
  assert.doesNotMatch(json, /Message bloqué/);
});

test("contestedPayload says so when no reason is given", () => {
  const json = JSON.stringify(contestedPayload(panel(), { reason: null }));
  assert.match(json, /Aucun motif donné/);
});

test("contestedPayload keeps the moderator buttons and the footer last", () => {
  const container = contestedPayload(panel(), { reason: "x" }).components[0];
  const types = container.components.map((part) => part.type);
  assert.equal(types.at(-1), ComponentType.ActionRow);
  assert.equal(types.at(-2), ComponentType.TextDisplay);
  assert.match(container.components.at(-2).content, /Supprimé de ce salon/);
});

test("contestedPayload stays silent", () => {
  const payload = contestedPayload(panel(), { reason: "x" });
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

function createBot(sent) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  const channel = {
    id: "log",
    isTextBased: () => true,
    send: async () => ({ id: "M-1" }),
    messages: { delete: async () => {} },
  };
  return {
    channel,
    bot: {
      db,
      user: { id: "bot" },
      utils: { createId: async (prefix) => `${prefix}-1` },
      users: { fetch: async () => ({ send: async (m) => sent.push(m) }) },
    },
  };
}

function execution(channel) {
  const rule = { creatorId: "bot", name: RULE_NAMES.words };
  return {
    action: { type: AutoModerationActionType.BlockMessage },
    autoModerationRule: rule,
    ruleId: "r",
    userId: "u",
    channelId: "c",
    messageId: "",
    matchedContent: "gros mot",
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

test("the private notice offers to contest the logged block", async () => {
  const sent = [];
  const { bot, channel } = createBot(sent);
  updateAutomodSettings(bot.db, "g", { logChannel: "log" }, "admin");
  await autoModerationActionExecution(bot, execution(channel));
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Ton message a été bloqué/);
  const button = JSON.parse(JSON.stringify(sent[0].components[0]))
    .components[0];
  assert.equal(button.custom_id, `${CONTEST_ID}:ask:g:log:M-1`);
  assert.equal(getLog(bot.db, { ...REF, messageId: "M-1" }).userId, "u");
});

test("no contest button when the window is turned off", async () => {
  const sent = [];
  const { bot, channel } = createBot(sent);
  updateAutomodSettings(
    bot.db,
    "g",
    { logChannel: "log", contestHours: 0 },
    "admin",
  );
  await autoModerationActionExecution(bot, execution(channel));
  assert.deepEqual(sent[0].components, []);
});

test("no contest button without a log to review", async () => {
  const sent = [];
  const { bot, channel } = createBot(sent);
  await autoModerationActionExecution(bot, execution(channel));
  assert.deepEqual(sent[0].components, []);
});
