const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Collection } = require("discord.js");
const loadComponents = require("../loaders/loadComponents");
const interactionCreate = require("../events/interactionCreate");
const { buildCustomId, parseCustomId } = require("../utils/customId");

test.mock.method(console, "log", () => {});
test.mock.method(console, "error", () => {});

function createBot() {
  const bot = {
    commands: new Collection(),
    components: new Collection(),
    db: null,
  };
  loadComponents(bot, path.join(__dirname, "fixtures/components"));
  return bot;
}

function fakeInteraction(customId, { modal }) {
  const replies = [];
  return {
    customId,
    replied: false,
    deferred: false,
    replies,
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isMessageComponent: () => !modal,
    isModalSubmit: () => modal,
    reply: async (payload) => replies.push(payload),
    followUp: async (payload) => replies.push(payload),
  };
}

function click(customId) {
  return fakeInteraction(customId, { modal: false });
}

function submit(customId) {
  return fakeInteraction(customId, { modal: true });
}

test("buildCustomId and parseCustomId go together", () => {
  const customId = buildCustomId("leaderboard", "week", 2);
  assert.equal(customId, "leaderboard:week:2");
  assert.deepEqual(parseCustomId(customId), {
    id: "leaderboard",
    params: ["week", "2"],
  });
});

test("buildCustomId rejects invalid parts", () => {
  assert.throws(() => buildCustomId("a", "b:c"), TypeError);
  assert.throws(() => buildCustomId("a", "x".repeat(100)), RangeError);
});

test("routes a click to its component with its params", async () => {
  const interaction = click("echo:a:b");
  await interactionCreate(createBot(), interaction);
  assert.deepEqual(interaction.replies, ["a,b"]);
});

test("answers when a component fails", async () => {
  const interaction = click("broken");
  await interactionCreate(createBot(), interaction);
  assert.equal(interaction.replies[0].content, "Une erreur est survenue.");
});

test("answers when a component no longer exists", async () => {
  const interaction = click("removed:1");
  await interactionCreate(createBot(), interaction);
  assert.equal(interaction.replies[0].content, "Ce bouton n'est plus actif.");
});

test("routes a modal submission to its component", async () => {
  const interaction = submit("echo:x");
  await interactionCreate(createBot(), interaction);
  assert.deepEqual(interaction.replies, ["x"]);
});
