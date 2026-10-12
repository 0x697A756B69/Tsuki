const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { updateAutomodSettings } = require("../utils/automodSettings");
const { updateRaidSettings } = require("../utils/raidSettings");
const { getJoinsSince, getLastTier } = require("../utils/raidLog");
const guildMemberAdd = require("../events/guildMemberAdd");

const DAY = 24 * 60 * 60 * 1000;

function createBot({ raid = {}, logChannel = "log" } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateRaidSettings(
    db,
    "g",
    {
      enabled: true,
      scope: "all",
      watchJoins: 3,
      alertJoins: 4,
      raidJoins: 5,
      ...raid,
    },
    "admin",
  );
  if (logChannel !== null)
    updateAutomodSettings(db, "g", { logChannel }, "admin");
  const sent = [];
  const guild = {
    id: "g",
    channels: {
      cache: new Map([
        [
          "log",
          {
            isTextBased: () => true,
            send: async (payload) => sent.push(payload),
          },
        ],
      ]),
    },
  };
  return { bot: { db }, guild, sent };
}

function member(guild, index, { bot = false, avatar = "hash" } = {}) {
  return {
    id: `u${index}`,
    guild,
    user: {
      bot,
      username: `x${index}`,
      createdTimestamp: Date.now() - (100 + index * 3) * DAY,
      avatar,
    },
  };
}

test("guildMemberAdd does nothing while the raid detection is off", async () => {
  const { bot, guild, sent } = createBot({ raid: { enabled: false } });
  await guildMemberAdd(bot, member(guild, 1));

  assert.deepEqual(getJoinsSince(bot.db, "g", 0), []);
  assert.equal(sent.length, 0);
});

test("guildMemberAdd ignores bots", async () => {
  const { bot, guild } = createBot();
  await guildMemberAdd(bot, member(guild, 1, { bot: true }));

  assert.deepEqual(getJoinsSince(bot.db, "g", 0), []);
});

test("guildMemberAdd records each join with its signals", async () => {
  const { bot, guild } = createBot();
  await guildMemberAdd(bot, member(guild, 1, { avatar: null }));
  await guildMemberAdd(bot, member(guild, 2));

  const joins = getJoinsSince(bot.db, "g", 0);
  assert.deepEqual(
    joins.map((join) => [join.user, join.signals]),
    [
      ["u1", ["avatar"]],
      ["u2", []],
    ],
  );
});

test("guildMemberAdd sends one alert per tier change in the log channel", async () => {
  const { bot, guild, sent } = createBot();
  for (const index of [1, 2]) await guildMemberAdd(bot, member(guild, index));
  assert.equal(sent.length, 0);

  await guildMemberAdd(bot, member(guild, 3));
  assert.equal(sent.length, 1);
  assert.match(JSON.stringify(sent[0].components[0].toJSON()), /Vigilance/);

  for (const index of [4, 5, 6])
    await guildMemberAdd(bot, member(guild, index));
  assert.equal(sent.length, 3);
  assert.equal(getLastTier(bot.db, "g").tier, "raid");
});

test("guildMemberAdd records the tier even without a log channel", async () => {
  const { bot, guild, sent } = createBot({ logChannel: null });
  for (const index of [1, 2, 3])
    await guildMemberAdd(bot, member(guild, index));

  assert.equal(sent.length, 0);
  assert.equal(getLastTier(bot.db, "g").tier, "watch");
});

test("guildMemberAdd keeps the recent joins in the bot memory", async () => {
  const { bot, guild } = createBot();
  await guildMemberAdd(bot, member(guild, 1));

  assert.equal(bot.raidMemory.get("g").recent.length, 1);
});

function withMembers(guild, timeouts) {
  guild.members = {
    cache: new Map(),
    fetch: async (id) => ({ timeout: async () => timeouts.push(id) }),
  };
}

test("guildMemberAdd applies the action of the tier to the recent group", async () => {
  const { bot, guild, sent } = createBot({ raid: { alertAction: "timeout" } });
  const timeouts = [];
  withMembers(guild, timeouts);
  for (const index of [1, 2, 3, 4])
    await guildMemberAdd(bot, member(guild, index));

  assert.deepEqual(timeouts, ["u1", "u2", "u3", "u4"]);
  assert.match(JSON.stringify(sent.at(-1).components[0].toJSON()), /Appliqué/);
});

test("guildMemberAdd leaves members alone for log-only tiers", async () => {
  const { bot, guild } = createBot();
  const timeouts = [];
  withMembers(guild, timeouts);
  for (const index of [1, 2, 3, 4, 5])
    await guildMemberAdd(bot, member(guild, index));

  assert.deepEqual(timeouts, []);
});

test("guildMemberAdd pauses the invites at the raid tier and says so", async () => {
  const { bot, guild, sent } = createBot({ raid: { lockdown: "invites" } });
  const incidents = [];
  guild.verificationLevel = 1;
  guild.incidentsData = null;
  guild.setIncidentActions = async (value) => incidents.push(value);
  for (const index of [1, 2, 3, 4, 5])
    await guildMemberAdd(bot, member(guild, index));

  assert.equal(incidents.length, 1);
  assert.match(
    JSON.stringify(sent.at(-1).components[0].toJSON()),
    /Verrouillage :\*\* invitations en pause/,
  );
});

test("guildMemberAdd keeps the invites open when the lockdown is off", async () => {
  const { bot, guild } = createBot();
  const incidents = [];
  guild.setIncidentActions = async (value) => incidents.push(value);
  for (const index of [1, 2, 3, 4, 5])
    await guildMemberAdd(bot, member(guild, index));

  assert.deepEqual(incidents, []);
});
