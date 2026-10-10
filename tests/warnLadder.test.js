const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  DEFAULT_LADDER,
  getLadder,
  setLadder,
  resetLadder,
  stepFor,
  nextSanction,
  isActive,
  countActiveWarnings,
  expiresAt,
  formatDuration,
  describeStep,
} = require("../utils/warnLadder");

const DAY = 24 * 60 * 60 * 1000;

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function addWarn(db, id, user, date) {
  db.prepare(
    "INSERT INTO warns (id, guild, user, author, reason, date) VALUES (?, 'g', ?, 'mod', 'x', ?)",
  ).run(id, user, date);
}

test("getLadder returns the default ladder for a new guild", () => {
  assert.deepEqual(getLadder(createDatabase(), "g"), DEFAULT_LADDER);
});

test("setLadder stores the steps and getLadder reads them back", () => {
  const db = createDatabase();
  const steps = [
    { warns: 1, sanction: "timeout", minutes: 5 },
    { warns: 2, sanction: "kick", minutes: null },
    { warns: 3, sanction: "ban", minutes: null },
  ];
  assert.deepEqual(setLadder(db, "g", steps), steps);
  assert.deepEqual(getLadder(db, "g"), steps);
});

test("setLadder rejects steps that are not 1, 2, 3...", () => {
  const db = createDatabase();
  assert.throws(
    () => setLadder(db, "g", [{ warns: 2, sanction: null, minutes: null }]),
    RangeError,
  );
  assert.throws(() => setLadder(db, "g", []), RangeError);
});

test("setLadder rejects unknown sanctions and bad durations", () => {
  const db = createDatabase();
  assert.throws(
    () => setLadder(db, "g", [{ warns: 1, sanction: "mute", minutes: null }]),
    TypeError,
  );
  assert.throws(
    () => setLadder(db, "g", [{ warns: 1, sanction: "timeout", minutes: 0 }]),
    RangeError,
  );
  assert.throws(
    () =>
      setLadder(db, "g", [{ warns: 1, sanction: "timeout", minutes: 50000 }]),
    RangeError,
  );
  assert.throws(
    () => setLadder(db, "g", [{ warns: 1, sanction: "kick", minutes: 10 }]),
    TypeError,
  );
});

test("a refused ladder leaves the previous one untouched", () => {
  const db = createDatabase();
  const steps = [{ warns: 1, sanction: "ban", minutes: null }];
  setLadder(db, "g", steps);
  assert.throws(() => setLadder(db, "g", []));
  assert.deepEqual(getLadder(db, "g"), steps);
});

test("resetLadder brings back the defaults", () => {
  const db = createDatabase();
  setLadder(db, "g", [{ warns: 1, sanction: "ban", minutes: null }]);
  assert.deepEqual(resetLadder(db, "g"), DEFAULT_LADDER);
});

test("stepFor picks the step of the count, then the last step beyond it", () => {
  assert.equal(stepFor(DEFAULT_LADDER, 0), null);
  assert.equal(stepFor(DEFAULT_LADDER, 1).sanction, null);
  assert.equal(stepFor(DEFAULT_LADDER, 2).minutes, 10);
  assert.equal(stepFor(DEFAULT_LADDER, 3).minutes, 60);
  assert.equal(stepFor(DEFAULT_LADDER, 4).minutes, 1440);
  assert.equal(stepFor(DEFAULT_LADDER, 9).minutes, 1440);
});

test("nextSanction finds the next step that punishes", () => {
  assert.equal(nextSanction(DEFAULT_LADDER, 0).warns, 2);
  assert.equal(nextSanction(DEFAULT_LADDER, 1).warns, 2);
  assert.equal(nextSanction(DEFAULT_LADDER, 2).warns, 3);
  assert.equal(nextSanction(DEFAULT_LADDER, 4), null);
});

test("isActive follows the validity period and 0 never expires", () => {
  const now = 100 * DAY;
  assert.equal(isActive(now - 29 * DAY, 30, now), true);
  assert.equal(isActive(now - 31 * DAY, 30, now), false);
  assert.equal(isActive(now - 31 * DAY, 30, now), false);
  assert.equal(isActive(1, 0, now), true);
});

test("countActiveWarnings ignores expired warnings and other members", () => {
  const db = createDatabase();
  const now = 100 * DAY;
  addWarn(db, "1", "u", now - 5 * DAY);
  addWarn(db, "2", "u", now - 40 * DAY);
  addWarn(db, "3", "other", now - DAY);
  assert.equal(countActiveWarnings(db, "g", "u", 30, now), 1);
  assert.equal(countActiveWarnings(db, "g", "u", 0, now), 2);
  assert.equal(countActiveWarnings(db, "g", "nobody", 30, now), 0);
});

test("expiresAt adds the validity period, or null when it never expires", () => {
  assert.equal(expiresAt(1000, 30), 1000 + 30 * DAY);
  assert.equal(expiresAt(1000, 0), null);
});

test("formatDuration uses the largest exact unit", () => {
  assert.equal(formatDuration(10), "10 min");
  assert.equal(formatDuration(90), "90 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(1440), "1 j");
  assert.equal(formatDuration(2880), "2 j");
});

test("describeStep words each sanction in French", () => {
  assert.equal(describeStep(DEFAULT_LADDER[0]), "aucune sanction");
  assert.equal(describeStep(DEFAULT_LADDER[2]), "sourdine de 1 h");
  assert.equal(
    describeStep({ warns: 5, sanction: "kick", minutes: null }),
    "expulsion",
  );
  assert.equal(
    describeStep({ warns: 6, sanction: "ban", minutes: null }),
    "bannissement",
  );
});

test("migration 020 gives warns their sanction columns", () => {
  const db = createDatabase();
  addWarn(db, "1", "u", 1);
  const row = db.prepare("SELECT sanction, timeout_until FROM warns").get();
  assert.equal(row.sanction, null);
  assert.equal(row.timeout_until, null);
});
