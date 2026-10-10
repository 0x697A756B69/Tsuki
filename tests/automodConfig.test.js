const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  parseWords,
  parseMentionLimit,
  parseEscalation,
  parseContest,
  parseSensitivity,
  parsePoints,
  getAutomodWords,
  setAutomodWords,
  getExemptions,
  setExemptions,
  getAutomodConfig,
  toggleObservation,
  syncErrorMessage,
} = require("../utils/automodConfig");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("parseWords splits on lines and commas and cleans the words", () => {
  assert.deepEqual(parseWords(" Foo \nbar, FOO\n\n  Baz qux "), {
    words: ["foo", "bar", "baz qux"],
  });
  assert.deepEqual(parseWords(""), { words: [] });
});

test("parseWords refuses too many or too long words", () => {
  const many = Array.from({ length: 1001 }, (_, index) => `mot${index}`);

  assert.match(parseWords(many.join("\n")).error, /trop de mots/);
  assert.match(parseWords("a".repeat(61)).error, /60 caractères/);
  assert.deepEqual(parseWords("a".repeat(60)).words, ["a".repeat(60)]);
});

test("parseMentionLimit reads a limit between 1 and 50", () => {
  assert.deepEqual(parseMentionLimit(" 8 "), { limit: 8 });
  assert.deepEqual(parseMentionLimit("1"), { limit: 1 });
  assert.deepEqual(parseMentionLimit("50"), { limit: 50 });
});

test("parseMentionLimit rejects anything else", () => {
  for (const value of ["", "0", "51", "-2", "2.5", "abc"])
    assert.match(parseMentionLimit(value).error, /entre 1 et 50/);
});

test("parseEscalation reads the duration", () => {
  assert.deepEqual(parseEscalation({ minutes: " 60 " }), {
    escalation: { escalationMinutes: 60 },
  });
  assert.deepEqual(parseEscalation({ minutes: "40320" }), {
    escalation: { escalationMinutes: 40320 },
  });
});

test("parseEscalation rejects an invalid duration", () => {
  for (const minutes of ["", "0", "40321", "1.5", "abc"])
    assert.match(parseEscalation({ minutes }).error, /durée/);
});

test("setAutomodWords replaces the whole list", () => {
  const db = createDatabase();
  setAutomodWords(db, "g", ["foo", "bar"], "admin");
  setAutomodWords(db, "g", ["baz"], "admin");

  assert.deepEqual(getAutomodWords(db, "g"), ["baz"]);
  setAutomodWords(db, "g", [], "admin");
  assert.deepEqual(getAutomodWords(db, "g"), []);
});

test("automod words are separate for each guild", () => {
  const db = createDatabase();
  setAutomodWords(db, "a", ["foo"], "admin");

  assert.deepEqual(getAutomodWords(db, "a"), ["foo"]);
  assert.deepEqual(getAutomodWords(db, "b"), []);
});

test("setExemptions replaces the roles and channels separately", () => {
  const db = createDatabase();
  setExemptions(db, "g", "role", ["r1", "r2"], "admin");
  setExemptions(db, "g", "channel", ["c1"], "admin");
  setExemptions(db, "g", "role", ["r3"], "admin");

  assert.deepEqual(getExemptions(db, "g"), {
    roles: ["r3"],
    channels: ["c1"],
  });
  setExemptions(db, "g", "channel", [], "admin");
  assert.deepEqual(getExemptions(db, "g").channels, []);
});

test("setExemptions rejects an unknown kind", () => {
  assert.throws(
    () => setExemptions(createDatabase(), "g", "member", ["m"], "admin"),
    TypeError,
  );
});

test("changing the words or the exemptions records who and when", () => {
  const db = createDatabase();
  setAutomodWords(db, "g", ["foo"], "admin");
  assert.equal(getAutomodSettings(db, "g").updatedBy, "admin");

  setExemptions(db, "h", "role", ["r"], "mod");
  assert.equal(getAutomodSettings(db, "h").updatedBy, "mod");
});

test("getAutomodConfig gathers everything the rules need", () => {
  const db = createDatabase();
  setAutomodWords(db, "g", ["foo"], "admin");
  setExemptions(db, "g", "role", ["r1"], "admin");
  setExemptions(db, "g", "channel", ["c1"], "admin");
  updateAutomodSettings(
    db,
    "g",
    { spamEnabled: true, mentionLimit: 8, logChannel: "42" },
    "admin",
  );

  assert.deepEqual(getAutomodConfig(db, "g"), {
    words: ["foo"],
    spam: true,
    mentions: false,
    mentionLimit: 8,
    exemptRoles: ["r1"],
    exemptChannels: ["c1"],
    logChannel: "42",
    observation: false,
  });
});

test("syncErrorMessage explains the usual Discord refusals", () => {
  assert.match(syncErrorMessage({ code: 50013 }), /Gérer le serveur/);
  assert.match(syncErrorMessage({ code: 30032 }), /limite/);
  assert.match(syncErrorMessage(new Error("boom")), /refusé/);
});

test("toggleObservation needs a log channel to start", () => {
  const settings = { logChannel: null, observation: false };
  assert.match(toggleObservation(settings).error, /salon de logs/);
  assert.deepEqual(toggleObservation({ ...settings, logChannel: "42" }), {
    observation: true,
  });
});

test("toggleObservation can always stop", () => {
  assert.deepEqual(toggleObservation({ logChannel: null, observation: true }), {
    observation: false,
  });
});

test("parseContest reads a window between 0 and 720 hours", () => {
  assert.deepEqual(parseContest(" 48 "), { contestHours: 48 });
  assert.deepEqual(parseContest("0"), { contestHours: 0 });
  assert.deepEqual(parseContest("720"), { contestHours: 720 });
});

test("parseContest rejects anything else", () => {
  for (const value of ["", "721", "-1", "1.5", "abc"])
    assert.match(parseContest(value).error, /entre 0 et 720 heures/);
});

test("parseSensitivity reads a threshold and a half-life", () => {
  assert.deepEqual(parseSensitivity({ threshold: " 10 ", halfLife: " 7 " }), {
    sensitivity: 10,
    halfLifeDays: 7,
  });
  assert.deepEqual(parseSensitivity({ threshold: "0", halfLife: "1" }), {
    sensitivity: 0,
    halfLifeDays: 1,
  });
  assert.deepEqual(parseSensitivity({ threshold: "100", halfLife: "30" }), {
    sensitivity: 100,
    halfLifeDays: 30,
  });
});

test("parseSensitivity rejects a bad threshold", () => {
  for (const threshold of ["", "101", "-1", "2.5", "abc"])
    assert.match(
      parseSensitivity({ threshold, halfLife: "3" }).error,
      /entre 0 et 100 points/,
    );
});

test("parseSensitivity rejects a bad half-life", () => {
  for (const halfLife of ["", "0", "31", "-1", "1.5", "abc"])
    assert.match(
      parseSensitivity({ threshold: "6", halfLife }).error,
      /entre 1 et 30 jours/,
    );
});

test("parsePoints reads the points of the three rules", () => {
  assert.deepEqual(parsePoints({ words: " 4 ", spam: "1", mentions: "20" }), {
    pointsWords: 4,
    pointsSpam: 1,
    pointsMentions: 20,
  });
});

test("parsePoints rejects any value outside 1 to 20", () => {
  for (const bad of ["", "0", "21", "-1", "1.5", "abc"])
    for (const key of ["words", "spam", "mentions"])
      assert.match(
        parsePoints({ words: "2", spam: "1", mentions: "3", [key]: bad }).error,
        /entre 1 et 20/,
      );
});
