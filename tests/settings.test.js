const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { getSettings, updateSettings } = require("../utils/settings");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("getSettings returns the defaults for a new guild", () => {
  assert.deepEqual(getSettings(createDatabase(), "g"), {
    announceMode: "current",
    announceChannel: null,
    announceMessage: "{membre} est passé niveau {niveau}, félicitations !",
    xpMin: 10,
    xpMax: 20,
    cooldown: 60,
  });
});

test("updateSettings only changes the given settings", () => {
  const db = createDatabase();
  const settings = updateSettings(db, "g", {
    announceMode: "channel",
    announceChannel: "123",
  });

  assert.equal(settings.announceMode, "channel");
  assert.equal(settings.announceChannel, "123");
  assert.equal(settings.xpMin, 10);
});

test("settings are separate for each guild", () => {
  const db = createDatabase();
  updateSettings(db, "a", { cooldown: 30 });

  assert.equal(getSettings(db, "a").cooldown, 30);
  assert.equal(getSettings(db, "b").cooldown, 60);
});

test("updateSettings rejects unknown settings", () => {
  assert.throws(
    () => updateSettings(createDatabase(), "g", { color: "red" }),
    TypeError,
  );
});

test("the database rejects invalid values", () => {
  const db = createDatabase();
  assert.throws(() => updateSettings(db, "g", { announceMode: "everywhere" }));
  assert.throws(() => updateSettings(db, "g", { xpMin: 30, xpMax: 20 }));
  assert.throws(() => updateSettings(db, "g", { cooldown: -1 }));
  assert.equal(getSettings(db, "g").xpMin, 10);
});
