const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../../loaders/migrate");
const {
  getRaidSettings,
  updateRaidSettings,
} = require("../../utils/raid/raidSettings");
const { MINUTE } = require("../../utils/raid/raidDetector");
const { getLastTier } = require("../../utils/raid/raidLog");
const { planResponse } = require("../../utils/raid/raidResponse");
const {
  banGroup,
  describeGroup,
  extendRaid,
  freeGroup,
  liftRaid,
} = require("../../utils/raid/raidControl");
const { KINDS } = require("../../utils/core/failure");

const NOW = 1700000000000;

function createFixture({ raid = {}, failing = [], tier = "alert" } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateRaidSettings(
    db,
    "g",
    { enabled: true, scope: "all", quarantineRole: "sas", ...raid },
    "admin",
  );
  const calls = [];
  const guild = {
    id: "g",
    members: {
      cache: new Map(),
      fetch: async (id) => ({
        timeout: async (value) => calls.push(["timeout", id, value]),
        roles: { remove: async (role) => calls.push(["unrole", id, role]) },
      }),
      ban: async (id) => {
        if (failing.includes(id)) throw new Error("Missing Permissions");
        calls.push(["ban", id]);
      },
    },
    verificationLevel: 1,
    incidentsData: null,
    setIncidentActions: async (value) =>
      calls.push(["incidents", value.invitesDisabledUntil]),
  };
  const bot = {
    db,
    raidMemory: new Map([
      [
        "g",
        {
          recent: [
            { user: "a", signals: ["age", "avatar"] },
            { user: "b", signals: ["age"] },
            { user: "c", signals: [] },
          ],
          state: { tier, heldAt: NOW - 5 * MINUTE },
          handled: new Map([
            ["a", "timeout"],
            ["b", "quarantine"],
            ["c", "kick"],
          ]),
          freed: new Set(),
        },
      ],
    ]),
  };
  return { db, bot, guild, calls, settings: getRaidSettings(db, "g") };
}

test("freeGroup lifts timeouts and quarantine but not kicks", async () => {
  const { bot, guild, calls, settings } = createFixture();
  const result = await freeGroup(bot, guild, settings);

  assert.deepEqual(calls, [
    ["timeout", "a", null],
    ["unrole", "b", "sas"],
  ]);
  assert.deepEqual(result, { freed: ["a", "b"], failed: [], causes: [] });
  assert.deepEqual([...bot.raidMemory.get("g").handled], [["c", "kick"]]);
});

test("freeGroup keeps the group from being punished again", async () => {
  const { bot, guild, settings } = createFixture();
  await freeGroup(bot, guild, settings);
  const entry = bot.raidMemory.get("g");

  assert.deepEqual([...entry.freed].sort(), ["a", "b", "c"]);
  const plan = planResponse({
    tier: "alert",
    settings: { ...settings, alertAction: "timeout" },
    recent: entry.recent,
    handled: entry.handled,
    freed: entry.freed,
  });
  assert.deepEqual(plan.targets, []);
});

test("planResponse skips freed members but still targets newcomers", () => {
  const plan = planResponse({
    tier: "alert",
    settings: {
      scope: "all",
      watchAction: "log",
      alertAction: "timeout",
      raidAction: "ban",
    },
    recent: [
      { user: "a", signals: [] },
      { user: "d", signals: [] },
    ],
    handled: new Map(),
    freed: new Set(["a"]),
  });
  assert.deepEqual(plan.targets, ["d"]);
});

test("describeGroup counts members and signals, ignoring freed and banned ones", () => {
  const { bot, settings } = createFixture();
  const entry = bot.raidMemory.get("g");
  entry.handled.set("c", "ban");
  entry.freed.add("b");

  assert.deepEqual(describeGroup(bot, "g", settings), {
    users: ["a"],
    signals: { "Compte récent": 1, "Sans avatar": 1 },
  });
});

test("describeGroup only counts suspects in the scope suspect", () => {
  const { bot, settings } = createFixture({ raid: { scope: "suspect" } });

  assert.deepEqual(describeGroup(bot, "g", settings).users, ["a"]);
});

test("banGroup bans the group and remembers it", async () => {
  const { bot, guild, calls, settings } = createFixture();
  const result = await banGroup(bot, guild, settings);

  assert.deepEqual(calls, [
    ["ban", "a"],
    ["ban", "b"],
    ["ban", "c"],
  ]);
  assert.deepEqual(result, {
    banned: ["a", "b", "c"],
    failed: [],
    causes: [],
  });
  assert.equal(bot.raidMemory.get("g").handled.get("a"), "ban");
});

test("banGroup reports failures and keeps going", async () => {
  const { bot, guild, settings } = createFixture({ failing: ["b"] });
  const result = await banGroup(bot, guild, settings);

  assert.deepEqual(result, {
    banned: ["a", "c"],
    failed: ["b"],
    causes: [KINDS.permissions],
  });
});

test("banGroup skips members already banned", async () => {
  const { bot, guild, calls, settings } = createFixture();
  bot.raidMemory.get("g").handled.set("a", "ban");
  await banGroup(bot, guild, settings);

  assert.deepEqual(
    calls.map((call) => call[1]),
    ["b", "c"],
  );
});

test("liftRaid frees the group and goes back to calm", async () => {
  const { db, bot, guild, settings } = createFixture();
  const result = await liftRaid(bot, guild, settings, NOW);
  const entry = bot.raidMemory.get("g");

  assert.deepEqual(result.freed, ["a", "b"]);
  assert.deepEqual(entry.state, { tier: "calm", heldAt: NOW });
  assert.deepEqual(entry.recent, []);
  assert.equal(entry.handled.size, 0);
  assert.equal(entry.freed.size, 0);
  assert.equal(getLastTier(db, "g").tier, "calm");
});

test("liftRaid also lifts an active lockdown", async () => {
  const { db, bot, guild, calls, settings } = createFixture();
  db.prepare(
    "INSERT INTO raid_lockdowns (guild, mode, previous_level, previous_invites_until, started_at) VALUES ('g', 'invites', NULL, NULL, 1)",
  ).run();
  const result = await liftRaid(bot, guild, settings, NOW);

  assert.equal(result.lockdown.action, "release");
  assert.deepEqual(calls.at(-1), ["incidents", null]);
});

test("liftRaid logs nothing when the raid was already calm", async () => {
  const { db, bot, guild, settings } = createFixture({ tier: "calm" });
  await liftRaid(bot, guild, settings, NOW);

  assert.equal(getLastTier(db, "g"), null);
});

test("extendRaid renews the hold and returns when the calm would start", () => {
  const { bot, settings } = createFixture();
  const until = extendRaid(bot, "g", settings, NOW);

  assert.equal(until, NOW + settings.calmMinutes * MINUTE);
  assert.equal(bot.raidMemory.get("g").state.heldAt, NOW);
  assert.equal(bot.raidMemory.get("g").state.tier, "alert");
});

test("extendRaid does nothing when there is no raid to hold", () => {
  const { bot, settings } = createFixture({ tier: "calm" });

  assert.equal(extendRaid(bot, "g", settings, NOW), null);
  assert.equal(bot.raidMemory.get("g").state.heldAt, NOW - 5 * MINUTE);
});
