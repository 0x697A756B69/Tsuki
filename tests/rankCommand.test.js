const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanvas } = require("@napi-rs/canvas");
const { addXp } = require("../utils/xp");
const {
  getRankCardData,
  formatNoXp,
  getCardColors,
} = require("../utils/rankCommand");
const rank = require("../commands/rank");
const r = require("../commands/r");
const { createDatabase } = require("./helpers/database");

test("getRankCardData gathers level, progress and position", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 150, "messages");
  addXp(db, "g", "b", 40, "messages");

  assert.deepEqual(getRankCardData(db, "g", "a"), {
    level: 1,
    current: 50,
    required: 155,
    totalXp: 150,
    position: 1,
    ranked: 2,
    label: null,
    xpLabel: "XP au total",
    breakdown: { messages: 150, voice: 0, manual: 0 },
  });
  assert.equal(getRankCardData(db, "g", "b").position, 2);
});

test("getRankCardData ranks each type on its own XP", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 150, "messages");
  addXp(db, "g", "a", 400, "voice");
  addXp(db, "g", "b", 300, "messages");

  assert.deepEqual(getRankCardData(db, "g", "a", "messages"), {
    level: 1,
    current: 50,
    required: 155,
    totalXp: 150,
    position: 2,
    ranked: 2,
    label: "Messages",
    xpLabel: "XP de messages",
    breakdown: null,
  });
  assert.deepEqual(getRankCardData(db, "g", "a", "voice"), {
    level: 2,
    current: 145,
    required: 220,
    totalXp: 400,
    position: 1,
    ranked: 1,
    label: "Vocal",
    xpLabel: "XP vocal",
    breakdown: null,
  });
  assert.equal(getRankCardData(db, "g", "b", "voice"), null);
});

test("getRankCardData splits the global XP by source", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 150, "messages");
  addXp(db, "g", "a", 40, "voice");
  addXp(db, "g", "a", -10, "manual");

  assert.deepEqual(getRankCardData(db, "g", "a").breakdown, {
    messages: 150,
    voice: 40,
    manual: -10,
  });
  assert.equal(getRankCardData(db, "g", "a").totalXp, 180);
});

test("getRankCardData rejects an unknown type", () => {
  assert.throws(
    () => getRankCardData(createDatabase(), "g", "a", "other"),
    RangeError,
  );
});

test("getRankCardData is null without XP", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 10, "messages");
  addXp(db, "g", "b", 5, "messages");
  addXp(db, "g", "b", -5, "manual");

  assert.equal(getRankCardData(db, "g", "nobody"), null);
  assert.equal(getRankCardData(db, "g", "b"), null);
  assert.equal(getRankCardData(db, "other", "a"), null);
});

test("formatNoXp speaks to the author or mentions the member", () => {
  assert.match(formatNoXp("<@1>", true), /Tu n'as pas encore d'XP/);
  assert.match(formatNoXp("<@1>", false), /<@1> n'a pas encore d'XP/);
});

test("formatNoXp names the type of XP that is missing", () => {
  assert.match(
    formatNoXp("<@1>", true, "voice"),
    /Tu n'as pas encore d'XP vocale/,
  );
  assert.match(
    formatNoXp("<@1>", false, "messages"),
    /<@1> n'a pas encore d'XP de messages/,
  );
});

test("/rank offers the global, messages and voice types", () => {
  const option = rank.options.find((o) => o.name === "type");
  assert.equal(option.type, "string");
  assert.equal(option.required ?? false, false);
  assert.deepEqual(
    option.choices.map((c) => c.value),
    ["global", "messages", "voice"],
  );
});

test("/r is a shortcut that reuses /rank", () => {
  assert.equal(r.name, "r");
  assert.notEqual(r.description, rank.description);
  assert.equal(r.run, rank.run);
  assert.deepEqual(r.options, rank.options);
  assert.equal(r.permission, rank.permission);
});

function createInteraction({
  memberOption = null,
  user = null,
  type = null,
} = {}) {
  const calls = [];
  const self = { id: "me", user: { bot: false } };
  return /** @type {any} */ ({
    calls,
    guildId: "g",
    member: self,
    options: {
      getUser: () => user,
      getString: () => type,
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

test("/rank type voice looks at the voice XP only", async () => {
  const db = createDatabase();
  addXp(db, "g", "me", 200, "messages");
  const interaction = createInteraction({ type: "voice" });
  interaction.member = {
    id: "me",
    user: { bot: false },
    displayName: "izuki",
    displayAvatarURL: () => createCanvas(8, 8).toBuffer("image/png"),
  };

  await rank.run(null, interaction, interaction.options, db);

  assert.equal(interaction.calls.length, 1);
  assert.match(
    interaction.calls[0][1].content,
    /Tu n'as pas encore d'XP vocale/,
  );
  assert.ok(interaction.calls[0][1].flags);

  addXp(db, "g", "me", 50, "voice");
  const again = createInteraction({ type: "voice" });
  again.member = interaction.member;
  await rank.run(null, again, again.options, db);
  assert.deepEqual(
    again.calls.map(([name]) => name),
    ["deferReply", "editReply"],
  );
});

test("/rank replies publicly with a PNG card", async () => {
  const db = createDatabase();
  addXp(db, "g", "me", 200, "messages");
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

test("getCardColors builds the bar gradient from the accent", () => {
  assert.deepEqual(getCardColors("#ff8800"), ["#ff8800", "#ffffff"]);
  assert.equal(getCardColors(null), undefined);
});
