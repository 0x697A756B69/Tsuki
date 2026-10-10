const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
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
    escalationMinutes: 60,
    sensitivity: 6,
    halfLifeDays: 3,
    pointsWords: 2,
    pointsSpam: 1,
    pointsMentions: 3,
    reasonWords: "Insultes",
    reasonSpam: "Spam",
    reasonMentions: "Mentions de masse",
    warnValidDays: 30,
    justiceCategory: null,
    keepTranscript: false,
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
    { escalationMinutes: 0 },
    { escalationMinutes: 40321 },
    { contestHours: -1 },
    { contestHours: 721 },
    { sensitivity: -1 },
    { sensitivity: 101 },
    { halfLifeDays: 0 },
    { halfLifeDays: 31 },
    { pointsWords: 0 },
    { pointsSpam: 21 },
    { pointsMentions: 0 },
  ])
    assert.throws(() => updateAutomodSettings(db, "g", changes, "admin"));

  const settings = getAutomodSettings(db, "g");
  assert.equal(settings.mentionLimit, 5);
  assert.equal(settings.escalationMinutes, 60);
  assert.equal(settings.updatedBy, null);
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

test("updateAutomodSettings changes the risk score settings", () => {
  const settings = updateAutomodSettings(
    createDatabase(),
    "g",
    {
      sensitivity: 10,
      halfLifeDays: 7,
      pointsWords: 4,
      pointsSpam: 2,
      pointsMentions: 5,
    },
    "admin",
  );

  assert.equal(settings.sensitivity, 10);
  assert.equal(settings.halfLifeDays, 7);
  assert.equal(settings.pointsWords, 4);
  assert.equal(settings.pointsSpam, 2);
  assert.equal(settings.pointsMentions, 5);
});

test("a sensitivity of zero turns the muting off", () => {
  assert.equal(
    updateAutomodSettings(createDatabase(), "g", { sensitivity: 0 }, "admin")
      .sensitivity,
    0,
  );
});

test("migration 017 turns the old warning threshold into a sensitivity", () => {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../migrations");
  for (const file of fs.readdirSync(dir).sort())
    if (Number.parseInt(file, 10) <= 16)
      db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  db.exec("PRAGMA user_version = 16");

  const insert = db.prepare(
    "INSERT INTO automod_settings (guild, escalation_warns) VALUES (?, ?)",
  );
  const thresholds = [0, 1, 2, 3, 4, 5, 20];
  for (const warns of thresholds) insert.run(`g${warns}`, warns);

  migrate(db);

  assert.deepEqual(
    thresholds.map((warns) => getAutomodSettings(db, `g${warns}`).sensitivity),
    [0, 3, 3, 6, 6, 10, 10],
  );
  assert.equal(getAutomodSettings(db, "g3").halfLifeDays, 3);
});

test("updateAutomodSettings saves the reasons and the warning validity", () => {
  const settings = updateAutomodSettings(
    createDatabase(),
    "g",
    { reasonWords: "Toxicité", warnValidDays: 0 },
    "admin",
  );

  assert.equal(settings.reasonWords, "Toxicité");
  assert.equal(settings.warnValidDays, 0);
  assert.equal(settings.reasonSpam, "Spam");
});

test("updateAutomodSettings stores the justice category and the transcript option", () => {
  const db = createDatabase();
  const settings = updateAutomodSettings(
    db,
    "g",
    { justiceCategory: "55", keepTranscript: true },
    "admin",
  );

  assert.equal(settings.justiceCategory, "55");
  assert.equal(settings.keepTranscript, true);
  assert.equal(
    updateAutomodSettings(db, "g", { justiceCategory: null }, "admin")
      .justiceCategory,
    null,
  );
});

test("the log table can remember the contest channel", () => {
  const columns = createDatabase()
    .prepare("PRAGMA table_info(automod_logs)")
    .all()
    .map((column) => column.name);

  assert.ok(columns.includes("contest_channel"));
});
