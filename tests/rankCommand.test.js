const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createCanvas } = require("@napi-rs/canvas");
const migrate = require("../loaders/migrate");
const { addXp } = require("../utils/xp");
const { getRankCardData, formatNoXp } = require("../utils/rankCommand");
const rank = require("../commands/rank");
const r = require("../commands/r");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("getRankCardData gathers level, progress and position", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 150);
  addXp(db, "g", "b", 40);

  assert.deepEqual(getRankCardData(db, "g", "a"), {
    level: 1,
    current: 50,
    required: 155,
    totalXp: 150,
    position: 1,
    ranked: 2,
  });
  assert.equal(getRankCardData(db, "g", "b").position, 2);
});

test("getRankCardData is null without XP", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 10);
  addXp(db, "g", "b", 5);
  addXp(db, "g", "b", -5);

  assert.equal(getRankCardData(db, "g", "nobody"), null);
  assert.equal(getRankCardData(db, "g", "b"), null);
  assert.equal(getRankCardData(db, "other", "a"), null);
});

test("formatNoXp speaks to the author or mentions the member", () => {
  assert.match(formatNoXp("<@1>", true), /Tu n'as pas encore d'XP/);
  assert.match(formatNoXp("<@1>", false), /<@1> n'a pas encore d'XP/);
});

test("/r is a shortcut that reuses /rank", () => {
  assert.equal(r.name, "r");
  assert.notEqual(r.description, rank.description);
  assert.equal(r.run, rank.run);
  assert.deepEqual(r.options, rank.options);
  assert.equal(r.permission, rank.permission);
});

function createInteraction({ memberOption = null, user = null } = {}) {
  const calls = [];
  const self = { id: "me", user: { bot: false } };
  return /** @type {any} */ ({
    calls,
    guildId: "g",
    member: self,
    options: {
      getUser: () => user,
      getMember: () => memberOption,
    },
    reply: async (payload) => calls.push(["reply", payload]),
    deferReply: async () => calls.push(["deferReply"]),
    editReply: async (payload) => calls.push(["editReply", payload]),
  });
}

test("/rank refuses bots and missing members privately", async () => {
  const db = createDatabase();
  const bots = createInteraction({
    user: {},
    memberOption: { id: "b", user: { bot: true } },
  });
  await rank.run(null, bots, bots.options, db);
  assert.match(bots.calls[0][1].content, /bots/);
  assert.ok(bots.calls[0][1].flags);

  const missing = createInteraction({ user: {} });
  await rank.run(null, missing, missing.options, db);
  assert.match(missing.calls[0][1].content, /pas sur le serveur/);
});

test("/rank refuses members without XP privately", async () => {
  const db = createDatabase();
  const interaction = createInteraction();
  await rank.run(null, interaction, interaction.options, db);

  assert.equal(interaction.calls.length, 1);
  assert.match(interaction.calls[0][1].content, /Tu n'as pas encore d'XP/);
  assert.ok(interaction.calls[0][1].flags);
});

test("/rank replies publicly with a PNG card", async () => {
  const db = createDatabase();
  addXp(db, "g", "me", 200);
  const interaction = createInteraction();
  interaction.member = {
    id: "me",
    user: { bot: false },
    displayName: "izuki",
    displayAvatarURL: () => createCanvas(8, 8).toBuffer("image/png"),
  };

  await rank.run(null, interaction, interaction.options, db);

  assert.deepEqual(
    interaction.calls.map(([name]) => name),
    ["deferReply", "editReply"],
  );
  assert.equal(interaction.calls[1][1].files[0].name, "rank.png");
});
