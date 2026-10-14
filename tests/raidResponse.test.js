const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getRaidSettings,
  updateRaidSettings,
} = require("../utils/raid/raidSettings");
const {
  ACTIONS,
  actionFor,
  planResponse,
  respondToRaid,
} = require("../utils/raid/raidResponse");
const { KINDS } = require("../utils/core/failure");

const settingsBase = {
  scope: "all",
  watchAction: "log",
  alertAction: "timeout",
  raidAction: "ban",
};

function joins(...specs) {
  return specs.map(([user, signals = []]) => ({ user, signals }));
}

function createFixture({ raid = {}, failing = [], roleExists = false } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateRaidSettings(
    db,
    "g",
    { enabled: true, scope: "all", timeoutMinutes: 30, ...raid },
    "admin",
  );
  const calls = [];
  const edits = [];
  const roles = new Map(roleExists ? [["role", { id: "role" }]] : []);
  const guild = {
    id: "g",
    members: {
      cache: new Map(),
      fetch: async (id) => ({
        timeout: async (ms) => {
          if (failing.includes(id)) throw new Error("Missing Permissions");
          calls.push(["timeout", id, ms]);
        },
        kick: async () => calls.push(["kick", id]),
        roles: { add: async (role) => calls.push(["role", id, role]) },
      }),
      ban: async (id) => {
        if (failing.includes(id)) throw new Error("Missing Permissions");
        calls.push(["ban", id]);
      },
    },
    roles: {
      cache: roles,
      create: async () => {
        const role = { id: "new" };
        roles.set("new", role);
        return role;
      },
    },
    channels: {
      cache: new Map([
        [
          "c1",
          {
            permissionOverwrites: {
              edit: async (role, permissions) =>
                edits.push([role.id, permissions]),
            },
          },
        ],
      ]),
    },
  };
  const bot = {
    db,
    raidMemory: new Map([
      ["g", { recent: [], state: null, handled: new Map(), freed: new Set() }],
    ]),
  };
  return { db, bot, guild, calls, edits, settings: getRaidSettings(db, "g") };
}

function raid(tier, ...specs) {
  return { evaluation: { tier }, recent: joins(...specs) };
}

test("actionFor reads the action of each tier and never acts when calm", () => {
  assert.equal(actionFor(settingsBase, "watch"), "log");
  assert.equal(actionFor(settingsBase, "alert"), "timeout");
  assert.equal(actionFor(settingsBase, "raid"), "ban");
  assert.equal(actionFor(settingsBase, "calm"), "log");
});

test("ACTIONS are ordered from the lightest to the heaviest", () => {
  assert.deepEqual(ACTIONS, ["log", "timeout", "quarantine", "kick", "ban"]);
});

test("planResponse targets nobody for a log-only tier", () => {
  const plan = planResponse({
    tier: "watch",
    settings: settingsBase,
    recent: joins(["a"], ["b"]),
    handled: new Map(),
  });
  assert.deepEqual(plan, { action: "log", targets: [] });
});

test("planResponse targets every recent member in the scope all", () => {
  const plan = planResponse({
    tier: "alert",
    settings: settingsBase,
    recent: joins(["a"], ["b", ["age"]]),
    handled: new Map(),
  });
  assert.deepEqual(plan, { action: "timeout", targets: ["a", "b"] });
});

test("planResponse keeps only suspects in the scope suspect", () => {
  const plan = planResponse({
    tier: "alert",
    settings: { ...settingsBase, scope: "suspect" },
    recent: joins(["a"], ["b", ["age"]], ["c", ["age", "avatar"]]),
    handled: new Map(),
  });
  assert.deepEqual(plan.targets, ["c"]);
});

test("planResponse skips members already handled by an equal or heavier action", () => {
  const handled = new Map([
    ["a", "timeout"],
    ["b", "kick"],
    ["c", "timeout"],
  ]);
  const plan = planResponse({
    tier: "alert",
    settings: settingsBase,
    recent: joins(["a"], ["b"], ["d"]),
    handled,
  });
  assert.deepEqual(plan.targets, ["d"]);
});

test("planResponse upgrades members handled by a lighter action", () => {
  const plan = planResponse({
    tier: "raid",
    settings: settingsBase,
    recent: joins(["a"], ["b"]),
    handled: new Map([["a", "timeout"]]),
  });
  assert.deepEqual(plan, { action: "ban", targets: ["a", "b"] });
});

test("respondToRaid times out the group for the configured duration", async () => {
  const { bot, guild, calls, settings } = createFixture({
    raid: { alertAction: "timeout" },
  });
  const response = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"], ["b"]),
  );

  assert.deepEqual(calls, [
    ["timeout", "a", 30 * 60 * 1000],
    ["timeout", "b", 30 * 60 * 1000],
  ]);
  assert.deepEqual(response.done, ["a", "b"]);
  assert.deepEqual(response.failed, []);
});

test("respondToRaid kicks and bans members", async () => {
  const kick = createFixture({ raid: { alertAction: "kick" } });
  await respondToRaid(
    kick.bot,
    kick.guild,
    kick.settings,
    raid("alert", ["a"]),
  );
  assert.deepEqual(kick.calls, [["kick", "a"]]);

  const ban = createFixture({ raid: { raidAction: "ban" } });
  await respondToRaid(ban.bot, ban.guild, ban.settings, raid("raid", ["a"]));
  assert.deepEqual(ban.calls, [["ban", "a"]]);
});

test("respondToRaid does not act twice on the same member", async () => {
  const { bot, guild, calls, settings } = createFixture({
    raid: { alertAction: "timeout" },
  });
  await respondToRaid(bot, guild, settings, raid("alert", ["a"]));
  const second = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"], ["b"]),
  );

  assert.deepEqual(second.done, ["b"]);
  assert.equal(calls.length, 2);
});

test("respondToRaid reports failures and keeps going", async () => {
  const { bot, guild, calls, settings } = createFixture({
    raid: { alertAction: "timeout" },
    failing: ["a"],
  });
  const response = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"], ["b"]),
  );

  assert.deepEqual(response.failed, ["a"]);
  assert.deepEqual(response.done, ["b"]);
  assert.equal(calls.length, 1);
});

test("respondToRaid retries a failed member on the next call", async () => {
  const { bot, guild, settings } = createFixture({
    raid: { alertAction: "timeout" },
    failing: ["a"],
  });
  await respondToRaid(bot, guild, settings, raid("alert", ["a"]));
  const again = await respondToRaid(bot, guild, settings, raid("alert", ["a"]));

  assert.deepEqual(again.failed, ["a"]);
});

test("respondToRaid applies nothing in observation but plans the targets", async () => {
  const { bot, guild, calls, settings } = createFixture({
    raid: { alertAction: "ban", observation: true },
  });
  const response = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"], ["b"]),
  );

  assert.deepEqual(calls, []);
  assert.deepEqual(response.planned, ["a", "b"]);
  assert.deepEqual(response.done, []);
  assert.equal(response.observed, true);
});

test("respondToRaid does nothing for a log-only tier", async () => {
  const { bot, guild, calls, settings } = createFixture();
  const response = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"]),
  );

  assert.deepEqual(calls, []);
  assert.deepEqual(response.planned, []);
});

test("respondToRaid creates a hidden quarantine role once and stores it", async () => {
  const { db, bot, guild, calls, edits, settings } = createFixture({
    raid: { alertAction: "quarantine" },
  });
  await respondToRaid(bot, guild, settings, raid("alert", ["a"]));

  assert.deepEqual(calls, [["role", "a", "new"]]);
  assert.deepEqual(edits, [["new", { ViewChannel: false }]]);
  assert.equal(getRaidSettings(db, "g").quarantineRole, "new");

  const stored = getRaidSettings(db, "g");
  await respondToRaid(bot, guild, stored, raid("alert", ["a"], ["b"]));
  assert.deepEqual(calls[1], ["role", "b", "new"]);
  assert.equal(edits.length, 1);
});

test("respondToRaid reuses an existing quarantine role", async () => {
  const fixture = createFixture({
    raid: { alertAction: "quarantine", quarantineRole: "role" },
    roleExists: true,
  });
  await respondToRaid(
    fixture.bot,
    fixture.guild,
    fixture.settings,
    raid("alert", ["a"]),
  );

  assert.deepEqual(fixture.calls, [["role", "a", "role"]]);
  assert.deepEqual(fixture.edits, []);
});

test("respondToRaid forgets the handled members when calm returns", async () => {
  const { bot, guild, calls, settings } = createFixture({
    raid: { alertAction: "timeout" },
  });
  await respondToRaid(bot, guild, settings, raid("alert", ["a"]));
  await respondToRaid(bot, guild, settings, raid("calm", ["a"]));
  await respondToRaid(bot, guild, settings, raid("alert", ["a"]));

  assert.equal(calls.length, 2);
});

test("two simultaneous raid responses act once per member", async () => {
  const { bot, guild, calls, settings } = createFixture({
    raid: { alertAction: "timeout" },
  });
  const [first, second] = await Promise.all([
    respondToRaid(bot, guild, settings, raid("alert", ["a"], ["b"])),
    respondToRaid(bot, guild, settings, raid("alert", ["a"], ["b"])),
  ]);

  assert.equal(calls.length, 2);
  assert.equal(first.done.length + second.done.length, 2);
});

test("a failed action is released so the member can be retried", async () => {
  const { bot, guild, settings } = createFixture({
    raid: { alertAction: "timeout" },
    failing: ["a"],
  });
  await respondToRaid(bot, guild, settings, raid("alert", ["a"]));
  assert.equal(bot.raidMemory.get("g").handled.has("a"), false);
});

test("a quarantine without a role releases every reserved member", async () => {
  const { bot, guild, settings } = createFixture({
    raid: { alertAction: "quarantine" },
  });
  guild.roles.create = async () => {
    throw new Error("Missing Permissions");
  };
  const response = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"], ["b"]),
  );
  assert.deepEqual(response.failed, ["a", "b"]);
  assert.equal(bot.raidMemory.get("g").handled.size, 0);
});

test("respondToRaid names the cause of each failure", async () => {
  const { bot, guild, settings } = createFixture({
    raid: { alertAction: "timeout" },
    failing: ["a"],
  });
  const response = await respondToRaid(
    bot,
    guild,
    settings,
    raid("alert", ["a"], ["b"]),
  );

  assert.deepEqual(response.causes, [KINDS.permissions]);
});
