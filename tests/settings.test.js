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
    voiceEnabled: true,
    voiceXp: 10,
    cardAccent: null,
    updatedBy: null,
    updatedAt: null,
  });
});

test("updateSettings only changes the given settings", () => {
  const db = createDatabase();
  const settings = updateSettings(
    db,
    "g",
    { announceMode: "channel", announceChannel: "123" },
    "admin",
  );

  assert.equal(settings.announceMode, "channel");
  assert.equal(settings.announceChannel, "123");
  assert.equal(settings.xpMin, 10);
});

test("updateSettings records who changed the settings and when", () => {
  const db = createDatabase();
  const settings = updateSettings(
    db,
    "g",
    { cooldown: 30 },
    "admin",
    1700000000000,
  );

  assert.equal(settings.updatedBy, "admin");
  assert.equal(settings.updatedAt, 1700000000000);
});

test("settings are separate for each guild", () => {
  const db = createDatabase();
  updateSettings(db, "a", { cooldown: 30 }, "admin");

  assert.equal(getSettings(db, "a").cooldown, 30);
  assert.equal(getSettings(db, "b").cooldown, 60);
});

test("updateSettings rejects unknown settings", () => {
  assert.throws(
    () => updateSettings(createDatabase(), "g", { color: "red" }, "admin"),
    TypeError,
  );
});

test("the database rejects invalid values", () => {
  const db = createDatabase();
  assert.throws(() =>
    updateSettings(db, "g", { announceMode: "everywhere" }, "admin"),
  );
  assert.throws(() =>
    updateSettings(db, "g", { xpMin: 30, xpMax: 20 }, "admin"),
  );
  assert.throws(() => updateSettings(db, "g", { cooldown: -1 }, "admin"));
  assert.equal(getSettings(db, "g").xpMin, 10);
  assert.equal(getSettings(db, "g").updatedBy, null);
});

test("updateSettings without changes only records the author", () => {
  const db = createDatabase();
  const settings = updateSettings(db, "g", {}, "admin", 1700000000000);

  assert.equal(settings.updatedBy, "admin");
  assert.equal(settings.cooldown, 60);
});

test("updateSettings stores the voice settings", () => {
  const db = createDatabase();
  const settings = updateSettings(
    db,
    "g",
    { voiceEnabled: false, voiceXp: 25 },
    "admin",
  );

  assert.equal(settings.voiceEnabled, false);
  assert.equal(settings.voiceXp, 25);
  assert.equal(getSettings(db, "g").voiceEnabled, false);
});

test("the database rejects a negative voice gain", () => {
  const db = createDatabase();
  assert.throws(() => updateSettings(db, "g", { voiceXp: -1 }, "admin"));
  assert.equal(getSettings(db, "g").voiceXp, 10);
});

test("updateSettings stores and clears the card accent", () => {
  const db = createDatabase();
  assert.equal(
    updateSettings(db, "g", { cardAccent: "#ff8800" }, "admin").cardAccent,
    "#ff8800",
  );
  assert.equal(
    updateSettings(db, "g", { cardAccent: null }, "admin").cardAccent,
    null,
  );
});

test("the database rejects a badly formatted card accent", () => {
  const db = createDatabase();
  for (const value of ["ff8800", "#ff88", "#FF8800", "#gg8800", "red"])
    assert.throws(() =>
      updateSettings(db, "g", { cardAccent: value }, "admin"),
    );
  assert.equal(getSettings(db, "g").cardAccent, null);
});
