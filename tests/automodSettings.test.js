const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");
const { createDatabase } = require("./helpers/database");

test("getAutomodSettings returns the defaults for a new guild", () => {
  assert.deepEqual(getAutomodSettings(createDatabase(), "g"), {
    logChannel: null,
    spamEnabled: false,
    mentionsEnabled: false,
    mentionLimit: 5,
    observation: false,
    contestHours: 168,
    escalationMinutes: 60,
    reasonWords: "Insultes",
    reasonSpam: "Spam",
    reasonMentions: "Mentions de masse",
    warnValidDays: 30,
    justiceCategory: null,
    keepTranscript: false,
    muteType: "timeout",
    muteRole: null,
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

test("updateAutomodSettings stores the mute type and the mute role", () => {
  const db = createDatabase();
  const settings = updateAutomodSettings(
    db,
    "g",
    { muteType: "role", muteRole: "77" },
    "admin",
  );

  assert.equal(settings.muteType, "role");
  assert.equal(settings.muteRole, "77");
});

test("updateAutomodSettings clears the mute role", () => {
  const db = createDatabase();
  updateAutomodSettings(db, "g", { muteRole: "77" }, "admin");

  assert.equal(
    updateAutomodSettings(db, "g", { muteRole: null }, "admin").muteRole,
    null,
  );
});

test("automod settings reject an unknown mute type", () => {
  const db = createDatabase();

  assert.throws(() =>
    updateAutomodSettings(db, "g", { muteType: "ghost" }, "admin"),
  );
});
