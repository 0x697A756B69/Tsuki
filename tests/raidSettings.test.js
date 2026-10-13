const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getRaidSettings,
  updateRaidSettings,
} = require("../utils/raidSettings");
const { createDatabase } = require("./helpers/database");

test("getRaidSettings returns the defaults for a new guild", () => {
  assert.deepEqual(getRaidSettings(createDatabase(), "g"), {
    enabled: false,
    observation: false,
    scope: "suspect",
    windowMinutes: 10,
    calmMinutes: 10,
    watchJoins: 5,
    alertJoins: 8,
    raidJoins: 10,
    accountDays: 7,
    signalAge: true,
    signalAvatar: true,
    signalNames: true,
    signalBurst: true,
    signalInvite: true,
    watchAction: "log",
    alertAction: "log",
    raidAction: "log",
    timeoutMinutes: 60,
    quarantineRole: null,
    lockdown: "off",
    updatedBy: null,
    updatedAt: null,
  });
});

test("updateRaidSettings only changes the given settings", () => {
  const settings = updateRaidSettings(
    createDatabase(),
    "g",
    { enabled: true, scope: "all", raidAction: "quarantine" },
    "admin",
    1700000000000,
  );

  assert.equal(settings.enabled, true);
  assert.equal(settings.scope, "all");
  assert.equal(settings.raidAction, "quarantine");
  assert.equal(settings.windowMinutes, 10);
  assert.equal(settings.updatedBy, "admin");
  assert.equal(settings.updatedAt, 1700000000000);
});

test("updateRaidSettings clears the quarantine role", () => {
  const db = createDatabase();
  updateRaidSettings(db, "g", { quarantineRole: "role" }, "admin");

  assert.equal(
    updateRaidSettings(db, "g", { quarantineRole: null }, "admin")
      .quarantineRole,
    null,
  );
});

test("raid settings are separate for each guild", () => {
  const db = createDatabase();
  updateRaidSettings(db, "a", { windowMinutes: 30 }, "admin");

  assert.equal(getRaidSettings(db, "a").windowMinutes, 30);
  assert.equal(getRaidSettings(db, "b").windowMinutes, 10);
});

test("updateRaidSettings rejects unknown settings", () => {
  assert.throws(
    () => updateRaidSettings(createDatabase(), "g", { color: "red" }, "admin"),
    TypeError,
  );
});

test("the database rejects invalid values", () => {
  const db = createDatabase();
  for (const changes of [
    { scope: "nobody" },
    { windowMinutes: 0 },
    { windowMinutes: 61 },
    { calmMinutes: 0 },
    { calmMinutes: 1441 },
    { watchJoins: 1 },
    { raidJoins: 201 },
    { accountDays: 0 },
    { accountDays: 366 },
    { watchAction: "mute" },
    { raidAction: "delete" },
    { timeoutMinutes: 0 },
    { timeoutMinutes: 40321 },
  ])
    assert.throws(() => updateRaidSettings(db, "g", changes, "admin"));

  const settings = getRaidSettings(db, "g");
  assert.equal(settings.scope, "suspect");
  assert.equal(settings.updatedBy, null);
});

test("the database keeps the tier thresholds in order", () => {
  const db = createDatabase();
  for (const changes of [
    { watchJoins: 9 },
    { raidJoins: 7 },
    { alertJoins: 4 },
  ])
    assert.throws(() => updateRaidSettings(db, "g", changes, "admin"));

  assert.equal(
    updateRaidSettings(
      db,
      "g",
      { watchJoins: 3, alertJoins: 6, raidJoins: 6 },
      "admin",
    ).alertJoins,
    6,
  );
});
