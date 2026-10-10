const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  parseWords,
  parseMentionLimit,
  parseContest,
  parseValidity,
  parseReasons,
  parseLadder,
  ladderLines,
  sectionView,
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
  assert.match(syncErrorMessage(new Error("boom")), /Détail : boom/);
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

test("parseValidity reads a number of days between 0 and 365", () => {
  assert.deepEqual(parseValidity(" 30 "), { warnValidDays: 30 });
  assert.deepEqual(parseValidity("0"), { warnValidDays: 0 });
  assert.deepEqual(parseValidity("365"), { warnValidDays: 365 });
});

test("parseValidity rejects anything else", () => {
  for (const value of ["", "366", "-1", "1.5", "abc"])
    assert.match(parseValidity(value).error, /entre 0 et 365 jours/);
});

test("parseReasons keeps one reason per line", () => {
  assert.deepEqual(parseReasons(" Spam \n\nPub\nspam"), {
    reasons: ["Spam", "Pub"],
  });
});

test("parseReasons refuses an empty, too long or too big list", () => {
  assert.match(parseReasons(" \n ").error, /au moins une raison/);
  assert.match(parseReasons("x".repeat(51)).error, /50 caractères/);
  const many = Array.from({ length: 25 }, (_, i) => `Raison ${i}`).join("\n");
  assert.match(parseReasons(many).error, /24 au maximum/);
});

test("parseLadder reads one sanction per line, in order", () => {
  assert.deepEqual(
    parseLadder(
      "aucune\nSourdine 10 min\nsourdine 1 h\nsourdine 2 j\nexpulsion\nbannissement",
    ).ladder,
    [
      { warns: 1, sanction: null, minutes: null },
      { warns: 2, sanction: "timeout", minutes: 10 },
      { warns: 3, sanction: "timeout", minutes: 60 },
      { warns: 4, sanction: "timeout", minutes: 2880 },
      { warns: 5, sanction: "kick", minutes: null },
      { warns: 6, sanction: "ban", minutes: null },
    ],
  );
});

test("parseLadder skips blank lines and accepts short units", () => {
  assert.deepEqual(parseLadder("rien\n\nsourdine 5m\n").ladder, [
    { warns: 1, sanction: null, minutes: null },
    { warns: 2, sanction: "timeout", minutes: 5 },
  ]);
});

test("parseLadder names the line it does not understand", () => {
  assert.match(parseLadder("aucune\nmute 5 min").error, /Ligne 2/);
  assert.match(parseLadder("sourdine dix minutes").error, /Ligne 1/);
});

test("parseLadder refuses an empty ladder and a bad timeout", () => {
  assert.match(parseLadder("  \n").error, /entre 1 et 10 lignes/);
  assert.match(
    parseLadder("aucune\n".repeat(11)).error,
    /entre 1 et 10 lignes/,
  );
  assert.match(parseLadder("sourdine 0 min").error, /1 minute à 28 jours/);
  assert.match(parseLadder("sourdine 29 j").error, /1 minute à 28 jours/);
});

test("ladderLines writes what parseLadder reads back", () => {
  const ladder = [
    { warns: 1, sanction: null, minutes: null },
    { warns: 2, sanction: "timeout", minutes: 10 },
    { warns: 3, sanction: "timeout", minutes: 60 },
    { warns: 4, sanction: "timeout", minutes: 1440 },
    { warns: 5, sanction: "kick", minutes: null },
    { warns: 6, sanction: "ban", minutes: null },
  ];
  assert.equal(
    ladderLines(ladder),
    "aucune\nsourdine 10 min\nsourdine 1 h\nsourdine 1 j\nexpulsion\nbannissement",
  );
  assert.deepEqual(parseLadder(ladderLines(ladder)).ladder, ladder);
});

test("sectionView builds each section and refuses an unknown one", () => {
  const db = createDatabase();
  const interaction = { guildId: "g", guild: { name: "Tsuki" } };
  for (const name of [
    "rules",
    "reasons",
    "ladder",
    "validity",
    "contest",
    "logs",
    "observation",
    "exemptions",
  ])
    assert.ok(sectionView(name, interaction, db).components, name);
  assert.equal(sectionView("profile", interaction, db), null);
});
