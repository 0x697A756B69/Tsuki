const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  DEFAULT_REASONS,
  cleanReasons,
  getReasons,
  setReasons,
  resetReasons,
} = require("../utils/warnReasons");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("getReasons returns the default list for a new guild", () => {
  assert.deepEqual(getReasons(createDatabase(), "g"), DEFAULT_REASONS);
});

test("setReasons replaces the list and keeps its order", () => {
  const db = createDatabase();
  setReasons(db, "g", ["Toxicité", "Spam"]);
  assert.deepEqual(getReasons(db, "g"), ["Toxicité", "Spam"]);
  setReasons(db, "g", ["Autre sujet"]);
  assert.deepEqual(getReasons(db, "g"), ["Autre sujet"]);
});

test("setReasons refuses an empty list", () => {
  assert.throws(
    () => setReasons(createDatabase(), "g", ["  ", ""]),
    RangeError,
  );
});

test("cleanReasons trims, removes duplicates and caps the list", () => {
  assert.deepEqual(cleanReasons([" Spam ", "spam", "", "Pub"]), [
    "Spam",
    "Pub",
  ]);
  const many = Array.from({ length: 40 }, (_, i) => `Raison ${i}`);
  assert.equal(cleanReasons(many).length, 24);
  assert.equal(cleanReasons(["x".repeat(80)])[0].length, 50);
});

test("resetReasons brings back the defaults", () => {
  const db = createDatabase();
  setReasons(db, "g", ["Toxicité"]);
  assert.deepEqual(resetReasons(db, "g"), DEFAULT_REASONS);
  assert.deepEqual(getReasons(db, "g"), DEFAULT_REASONS);
});

test("reasons are separate for each guild", () => {
  const db = createDatabase();
  setReasons(db, "a", ["Toxicité"]);
  assert.deepEqual(getReasons(db, "b"), DEFAULT_REASONS);
});
