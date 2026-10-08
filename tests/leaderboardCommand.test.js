const test = require("node:test");
const { ButtonStyle } = require("discord.js");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { updateSettings } = require("../utils/settings");
const { parseCustomId } = require("../utils/customId");
const {
  isPeriod,
  isType,
  getLeaderboardData,
  resolveNames,
  buildLeaderboardControls,
  buildLeaderboardMessage,
} = require("../utils/leaderboardCommand");
const leaderboard = require("../commands/leaderboard");
const lb = require("../commands/lb");
const component = require("../components/leaderboard");

const NOW = new Date("2026-10-08T10:00:00Z");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  db.prepare(
    "INSERT INTO message_daily (guild, day, channel, user, messages) VALUES ('g', '2026-10-08', 'general', 'a', 30), ('g', '2026-10-08', 'gone', 'b', 10)",
  ).run();
  db.prepare(
    "INSERT INTO voice_daily (guild, day, user, minutes) VALUES ('g', '2026-10-08', 'b', 90), ('g', '2026-10-08', 'a', 20)",
  ).run();
  return db;
}

function createGuild() {
  return {
    id: "g",
    members: {
      cache: new Map([["a", { displayName: "Alice" }]]),
      fetch: async () => {
        throw new Error("Unknown Member");
      },
    },
    channels: { cache: new Map([["general", { name: "general" }]]) },
  };
}

test("isPeriod and isType only accept known values", () => {
  assert.ok(["global", "month", "week"].every(isPeriod));
  assert.ok(["messages", "voice"].every(isType));
  assert.ok(!isPeriod("year") && !isPeriod(null));
  assert.ok(!isType("xp") && !isType(undefined));
});

test("getLeaderboardData gathers the lists with raw identifiers", () => {
  const data = getLeaderboardData(createDatabase(), "g", {
    type: "messages",
    period: "global",
    voiceEnabled: true,
    date: NOW,
  });

  assert.equal(data.type, "messages");
  assert.deepEqual(data.members, [
    { id: "a", value: 30 },
    { id: "b", value: 10 },
  ]);
  assert.deepEqual(data.channels, [
    { id: "general", value: 30 },
    { id: "gone", value: 10 },
  ]);
  assert.deepEqual(data.voice, [
    { id: "b", value: 90 },
    { id: "a", value: 20 },
  ]);
  assert.equal(data.activity.length, 6);
  assert.equal(data.activity[5].value, 40);
});

test("getLeaderboardData ranks voice minutes for the voice type", () => {
  const data = getLeaderboardData(createDatabase(), "g", {
    type: "voice",
    period: "week",
    voiceEnabled: true,
    date: NOW,
  });

  assert.equal(data.type, "voice");
  assert.deepEqual(data.members[0], { id: "b", value: 90 });
  assert.equal(data.activity[3].value, 110);
});

test("getLeaderboardData drops the voice data when voice is disabled", () => {
  const data = getLeaderboardData(createDatabase(), "g", {
    type: "voice",
    period: "global",
    voiceEnabled: false,
    date: NOW,
  });

  assert.equal(data.type, "messages");
  assert.equal(data.voice, null);
  assert.deepEqual(data.members[0], { id: "a", value: 30 });
});

test("resolveNames swaps identifiers for names and keeps unknown ones readable", async () => {
  const db = createDatabase();
  const data = getLeaderboardData(db, "g", {
    type: "messages",
    period: "global",
    voiceEnabled: true,
    date: NOW,
  });

  const resolved = await resolveNames(createGuild(), data);

  assert.deepEqual(resolved.members, [
    { name: "Alice", value: 30 },
    { name: "Ancien membre", value: 10 },
  ]);
  assert.deepEqual(resolved.channels, [
    { name: "#general", value: 30 },
    { name: "#salon-supprimé", value: 10 },
  ]);
  assert.deepEqual(resolved.voice, [
    { name: "Ancien membre", value: 90 },
    { name: "Alice", value: 20 },
  ]);
  assert.deepEqual(resolved.activity, data.activity);
  assert.equal(resolved.type, "messages");
  assert.equal(resolved.period, "global");
});

test("resolveNames keeps a missing voice panel missing", async () => {
  const resolved = await resolveNames(createGuild(), {
    type: "messages",
    period: "global",
    members: [],
    activity: [],
    channels: [],
    voice: null,
  });
  assert.equal(resolved.voice, null);
});

test("the controls are one row of period then type buttons", () => {
  const rows = buildLeaderboardControls({
    type: "voice",
    period: "month",
    authorId: "me",
    voiceEnabled: true,
  });
  const buttons = /** @type {any} */ (rows[0]).components;

  assert.equal(rows.length, 1);
  assert.deepEqual(
    buttons.map((button) => button.label),
    ["Global", "Mois", "Semaine", "Messages", "Vocal"],
  );
  assert.deepEqual(
    buttons.map((button) => button.disabled ?? false),
    [false, false, false, false, false],
  );
  assert.deepEqual(
    buttons.map((button) => button.style),
    [
      ButtonStyle.Secondary,
      ButtonStyle.Primary,
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
      ButtonStyle.Success,
    ],
  );
  assert.deepEqual(parseCustomId(buttons[2].custom_id), {
    id: "leaderboard",
    params: ["period", "voice", "week", "me"],
  });
  assert.deepEqual(parseCustomId(buttons[3].custom_id), {
    id: "leaderboard",
    params: ["type", "messages", "month", "me"],
  });
});

test("the type buttons disappear when voice is disabled", () => {
  const rows = buildLeaderboardControls({
    type: "messages",
    period: "global",
    authorId: "me",
    voiceEnabled: false,
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(
    /** @type {any} */ (rows[0]).components.map((button) => button.label),
    ["Global", "Mois", "Semaine"],
  );
});

test("buildLeaderboardMessage returns a PNG and the controls", async () => {
  const message = await buildLeaderboardMessage(
    createDatabase(),
    createGuild(),
    {
      type: "messages",
      period: "week",
      authorId: "me",
      date: NOW,
    },
  );

  assert.equal(message.files[0].name, "leaderboard-messages-week.png");
  assert.equal(
    /** @type {any} */ (message.files[0].attachment).subarray(1, 4).toString(),
    "PNG",
  );
  assert.deepEqual(message.attachments, []);
  assert.equal(message.components.length, 1);
});

test("buildLeaderboardMessage falls back to messages when voice is disabled", async () => {
  const db = createDatabase();
  updateSettings(db, "g", { voiceEnabled: false }, "admin");

  const message = await buildLeaderboardMessage(db, createGuild(), {
    type: "voice",
    period: "global",
    authorId: "me",
    date: NOW,
  });

  assert.equal(message.files[0].name, "leaderboard-messages-global.png");
});

function createCommandInteraction() {
  const calls = [];
  return /** @type {any} */ ({
    calls,
    guild: createGuild(),
    user: { id: "me" },
    deferReply: async () => calls.push(["deferReply"]),
    editReply: async (payload) => calls.push(["editReply", payload]),
  });
}

test("/leaderboard replies publicly with the global messages ranking", async () => {
  const interaction = createCommandInteraction();

  await leaderboard.run(null, interaction, null, createDatabase());

  assert.deepEqual(
    interaction.calls.map(([name]) => name),
    ["deferReply", "editReply"],
  );
  assert.equal(
    interaction.calls[1][1].files[0].name,
    "leaderboard-messages-global.png",
  );
  const buttons = interaction.calls[1][1].components[0];
  assert.equal(buttons.components[0].style, ButtonStyle.Primary);
});

test("/lb is a shortcut that reuses /leaderboard", () => {
  assert.equal(lb.name, "lb");
  assert.notEqual(lb.description, leaderboard.description);
  assert.equal(lb.run, leaderboard.run);
  assert.equal(lb.permission, leaderboard.permission);
});

function createComponentInteraction({ userId = "me" } = {}) {
  const calls = [];
  return /** @type {any} */ ({
    calls,
    guild: createGuild(),
    user: { id: userId },
    deferUpdate: async () => calls.push(["deferUpdate"]),
    editReply: async (payload) => calls.push(["editReply", payload]),
    reply: async (payload) => calls.push(["reply", payload]),
  });
}

test("a period button redraws the ranking for that period", async () => {
  const interaction = createComponentInteraction();

  await component.run(
    null,
    interaction,
    ["period", "messages", "week", "me"],
    createDatabase(),
  );

  assert.deepEqual(
    interaction.calls.map(([name]) => name),
    ["deferUpdate", "editReply"],
  );
  assert.equal(
    interaction.calls[1][1].files[0].name,
    "leaderboard-messages-week.png",
  );
});

test("a type button redraws the ranking for that type", async () => {
  const interaction = createComponentInteraction();

  await component.run(
    null,
    interaction,
    ["type", "voice", "month", "me"],
    createDatabase(),
  );

  assert.equal(
    interaction.calls[1][1].files[0].name,
    "leaderboard-voice-month.png",
  );
});

test("only the author can change the ranking", async () => {
  const interaction = createComponentInteraction({ userId: "intruder" });

  await component.run(
    null,
    interaction,
    ["period", "messages", "week", "me"],
    createDatabase(),
  );

  assert.deepEqual(
    interaction.calls.map(([name]) => name),
    ["reply"],
  );
  assert.match(interaction.calls[0][1].content, /personne qui a lancé/);
  assert.ok(interaction.calls[0][1].flags);
});

test("an outdated button is refused privately", async () => {
  for (const params of [
    ["period", "messages", "year", "me"],
    ["period", "xp", "week", "me"],
    ["jump", "messages", "week", "me"],
  ]) {
    const interaction = createComponentInteraction();
    await component.run(null, interaction, params, createDatabase());
    assert.deepEqual(
      interaction.calls.map(([name]) => name),
      ["reply"],
    );
    assert.match(interaction.calls[0][1].content, /plus actif/);
  }
});
