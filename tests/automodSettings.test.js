const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("getAutomodSettings returns the defaults for a new guild", () => {
  assert.deepEqual(getAutomodSettings(createDatabase(), "g"), {
    logChannel: null,
    spamEnabled: false,
    mentionsEnabled: false,
    mentionLimit: 5,
    observation: false,
    contestHours: 168,
    escalationWarns: 3,
    escalationMinutes: 60,
    updatedBy: null,
    updatedAt: null,
  });
});

test("updateAutomodSettings only changes the given settings", () => {
  const db = createDatabase();
  const settings = updateAutomodSettings(
    db,
    "g",
    { logChannel: "123", mentionLimit: 8 },
    "admin",
  );

  assert.equal(settings.logChannel, "123");
  assert.equal(settings.mentionLimit, 8);
  assert.equal(settings.escalationWarns, 3);
});

test("updateAutomodSettings records who changed the settings and when", () => {
  const db = createDatabase();
  const settings = updateAutomodSettings(
    db,
    "g",
    { escalationMinutes: 120 },
    "admin",
    1700000000000,
  );

  assert.equal(settings.updatedBy, "admin");
  assert.equal(settings.updatedAt, 1700000000000);
});

test("updateAutomodSettings clears the log channel", () => {
  const db = createDatabase();
  updateAutomodSettings(db, "g", { logChannel: "123" }, "admin");

  assert.equal(
    updateAutomodSettings(db, "g", { logChannel: null }, "admin").logChannel,
    null,
  );
});

test("automod settings are separate for each guild", () => {
  const db = createDatabase();
  updateAutomodSettings(db, "a", { mentionLimit: 10 }, "admin");

  assert.equal(getAutomodSettings(db, "a").mentionLimit, 10);
  assert.equal(getAutomodSettings(db, "b").mentionLimit, 5);
});

test("updateAutomodSettings rejects unknown settings", () => {
  assert.throws(
    () =>
      updateAutomodSettings(createDatabase(), "g", { color: "red" }, "admin"),
    TypeError,
  );
});

test("the database rejects invalid values", () => {
  const db = createDatabase();
  for (const changes of [
    { mentionLimit: 0 },
    { mentionLimit: 51 },
    { escalationWarns: -1 },
    { escalationMinutes: 0 },
    { escalationMinutes: 40321 },
    { contestHours: -1 },
    { contestHours: 721 },
  ])
    assert.throws(() => updateAutomodSettings(db, "g", changes, "admin"));

  const settings = getAutomodSettings(db, "g");
  assert.equal(settings.mentionLimit, 5);
  assert.equal(settings.escalationMinutes, 60);
  assert.equal(settings.updatedBy, null);
});

test("an escalation of zero warnings turns the escalation off", () => {
  const db = createDatabase();

  assert.equal(
    updateAutomodSettings(db, "g", { escalationWarns: 0 }, "admin")
      .escalationWarns,
    0,
  );
});

test("updateAutomodSettings turns the spam and mention rules on and off", () => {
  const db = createDatabase();
  const on = updateAutomodSettings(
    db,
    "g",
    { spamEnabled: true, mentionsEnabled: true },
    "admin",
  );
  assert.equal(on.spamEnabled, true);
  assert.equal(on.mentionsEnabled, true);

  const off = updateAutomodSettings(db, "g", { spamEnabled: false }, "admin");
  assert.equal(off.spamEnabled, false);
  assert.equal(off.mentionsEnabled, true);
});

test("updateAutomodSettings turns the observation mode on and off", () => {
  const db = createDatabase();
  assert.equal(
    updateAutomodSettings(db, "g", { observation: true }, "admin").observation,
    true,
  );
  assert.equal(
    updateAutomodSettings(db, "g", { observation: false }, "admin").observation,
    false,
  );
});

test("updateAutomodSettings changes the contest window and turns it off", () => {
  const db = createDatabase();
  assert.equal(
    updateAutomodSettings(db, "g", { contestHours: 48 }, "admin").contestHours,
    48,
  );
  assert.equal(
    updateAutomodSettings(db, "g", { contestHours: 0 }, "admin").contestHours,
    0,
  );
});
