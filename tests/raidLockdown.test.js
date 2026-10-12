const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { GuildVerificationLevel } = require("discord.js");
const migrate = require("../loaders/migrate");
const {
  getRaidSettings,
  updateRaidSettings,
} = require("../utils/raidSettings");
const {
  MODE_LABELS,
  getLockdown,
  planLockdown,
  syncLockdown,
} = require("../utils/raidLockdown");

const NOW = 1700000000000;
const HOUR = 60 * 60 * 1000;

function createFixture({
  lockdown = "invites",
  observation = false,
  level = GuildVerificationLevel.Low,
  invitesUntil = null,
  failing = false,
} = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateRaidSettings(
    db,
    "g",
    { enabled: true, lockdown, observation },
    "admin",
  );
  const calls = [];
  const guild = {
    id: "g",
    verificationLevel: level,
    incidentsData: invitesUntil
      ? { invitesDisabledUntil: new Date(invitesUntil) }
      : null,
    setIncidentActions: async (actions) => {
      if (failing) throw new Error("Missing Permissions");
      calls.push(["incidents", actions.invitesDisabledUntil]);
    },
    setVerificationLevel: async (value) => {
      if (failing) throw new Error("Missing Permissions");
      calls.push(["level", value]);
      guild.verificationLevel = value;
    },
  };
  return { db, guild, calls, settings: getRaidSettings(db, "g") };
}

test("MODE_LABELS names both lockdown modes", () => {
  assert.deepEqual(Object.keys(MODE_LABELS).sort(), [
    "invites",
    "verification",
  ]);
});

test("planLockdown engages at the raid tier when a mode is chosen", () => {
  const plan = planLockdown({
    tier: "raid",
    settings: { lockdown: "verification" },
    active: null,
  });
  assert.deepEqual(plan, { action: "engage", mode: "verification" });
});

test("planLockdown does nothing when the lockdown is off", () => {
  const plan = planLockdown({
    tier: "raid",
    settings: { lockdown: "off" },
    active: null,
  });
  assert.equal(plan, null);
});

test("planLockdown does nothing below the raid tier without an active lockdown", () => {
  for (const tier of ["calm", "watch", "alert"])
    assert.equal(
      planLockdown({ tier, settings: { lockdown: "invites" }, active: null }),
      null,
    );
});

test("planLockdown does not engage twice", () => {
  const plan = planLockdown({
    tier: "raid",
    settings: { lockdown: "invites" },
    active: { mode: "invites" },
  });
  assert.equal(plan, null);
});

test("planLockdown releases once the tier leaves raid, even if the setting is off", () => {
  for (const tier of ["calm", "watch", "alert"])
    assert.deepEqual(
      planLockdown({
        tier,
        settings: { lockdown: "off" },
        active: { mode: "invites" },
      }),
      { action: "release", mode: "invites" },
    );
});

test("syncLockdown pauses invites for a day and remembers the previous state", async () => {
  const { db, guild, calls, settings } = createFixture();
  const result = await syncLockdown(db, guild, settings, "raid", NOW);

  assert.deepEqual(result, {
    action: "engage",
    mode: "invites",
    observed: false,
    ok: true,
  });
  assert.deepEqual(calls, [["incidents", new Date(NOW + 24 * HOUR)]]);
  assert.equal(getLockdown(db, "g").mode, "invites");
});

test("syncLockdown restores invites to enabled when they were enabled before", async () => {
  const { db, guild, calls, settings } = createFixture();
  await syncLockdown(db, guild, settings, "raid", NOW);
  const result = await syncLockdown(db, guild, settings, "calm", NOW + HOUR);

  assert.equal(result.action, "release");
  assert.equal(result.ok, true);
  assert.deepEqual(calls[1], ["incidents", null]);
  assert.equal(getLockdown(db, "g"), null);
});

test("syncLockdown restores the exact earlier invite pause", async () => {
  const until = NOW + 5 * HOUR;
  const { db, guild, calls, settings } = createFixture({ invitesUntil: until });
  await syncLockdown(db, guild, settings, "raid", NOW);
  await syncLockdown(db, guild, settings, "calm", NOW + HOUR);

  assert.deepEqual(calls[1], ["incidents", new Date(until)]);
});

test("syncLockdown does not restore an invite pause that already ended", async () => {
  const { db, guild, calls, settings } = createFixture({
    invitesUntil: NOW + HOUR,
  });
  await syncLockdown(db, guild, settings, "raid", NOW);
  await syncLockdown(db, guild, settings, "calm", NOW + 2 * HOUR);

  assert.deepEqual(calls[1], ["incidents", null]);
});

test("syncLockdown raises the verification level and puts the old one back", async () => {
  const { db, guild, calls, settings } = createFixture({
    lockdown: "verification",
    level: GuildVerificationLevel.Medium,
  });
  await syncLockdown(db, guild, settings, "raid", NOW);
  assert.deepEqual(calls, [["level", GuildVerificationLevel.VeryHigh]]);

  await syncLockdown(db, guild, settings, "alert", NOW + HOUR);
  assert.deepEqual(calls[1], ["level", GuildVerificationLevel.Medium]);
  assert.equal(getLockdown(db, "g"), null);
});

test("syncLockdown leaves a verification level that is already at the maximum", async () => {
  const { db, guild, calls, settings } = createFixture({
    lockdown: "verification",
    level: GuildVerificationLevel.VeryHigh,
  });
  await syncLockdown(db, guild, settings, "raid", NOW);
  await syncLockdown(db, guild, settings, "calm", NOW + HOUR);

  assert.deepEqual(calls, []);
  assert.equal(getLockdown(db, "g"), null);
});

test("syncLockdown does not engage twice for the same raid", async () => {
  const { db, guild, calls, settings } = createFixture();
  await syncLockdown(db, guild, settings, "raid", NOW);
  const again = await syncLockdown(db, guild, settings, "raid", NOW + HOUR);

  assert.equal(again, null);
  assert.equal(calls.length, 1);
});

test("syncLockdown only plans the lockdown in observation", async () => {
  const { db, guild, calls, settings } = createFixture({ observation: true });
  const result = await syncLockdown(db, guild, settings, "raid", NOW);

  assert.deepEqual(result, {
    action: "engage",
    mode: "invites",
    observed: true,
    ok: true,
  });
  assert.deepEqual(calls, []);
  assert.equal(getLockdown(db, "g"), null);
});

test("syncLockdown reports a failed engage and stores nothing", async () => {
  const { db, guild, settings } = createFixture({ failing: true });
  const result = await syncLockdown(db, guild, settings, "raid", NOW);

  assert.equal(result.ok, false);
  assert.equal(getLockdown(db, "g"), null);
});

test("syncLockdown keeps the lockdown when the release fails, then retries", async () => {
  const { db, guild, settings } = createFixture();
  await syncLockdown(db, guild, settings, "raid", NOW);
  guild.setIncidentActions = async () => {
    throw new Error("Missing Permissions");
  };
  const failed = await syncLockdown(db, guild, settings, "calm", NOW + HOUR);
  assert.equal(failed.ok, false);
  assert.notEqual(getLockdown(db, "g"), null);

  const calls = [];
  guild.setIncidentActions = async (actions) => {
    calls.push(actions.invitesDisabledUntil);
  };
  const retried = await syncLockdown(
    db,
    guild,
    settings,
    "calm",
    NOW + 2 * HOUR,
  );
  assert.equal(retried.ok, true);
  assert.deepEqual(calls, [null]);
  assert.equal(getLockdown(db, "g"), null);
});
