const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { getRewards, setReward, removeReward } = require("../utils/rewards");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("rewards are listed by level", () => {
  const db = createDatabase();
  setReward(db, "g", 25, "veteran");
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");

  assert.deepEqual(getRewards(db, "g"), [
    { level: 5, role: "regular" },
    { level: 10, role: "active" },
    { level: 25, role: "veteran" },
  ]);
});

test("a guild without rewards has an empty list", () => {
  assert.deepEqual(getRewards(createDatabase(), "g"), []);
});

test("a new role replaces the one already set at that level", () => {
  const db = createDatabase();
  setReward(db, "g", 10, "active");
  setReward(db, "g", 10, "hero");

  assert.deepEqual(getRewards(db, "g"), [{ level: 10, role: "hero" }]);
});

test("a role moves to its new level instead of being duplicated", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  setReward(db, "g", 15, "regular");

  assert.deepEqual(getRewards(db, "g"), [
    { level: 10, role: "active" },
    { level: 15, role: "regular" },
  ]);
});

test("moving a role onto a taken level replaces that level's role", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  setReward(db, "g", 10, "regular");

  assert.deepEqual(getRewards(db, "g"), [{ level: 10, role: "regular" }]);
});

test("removeReward deletes the reward of a role", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  removeReward(db, "g", "regular");

  assert.deepEqual(getRewards(db, "g"), [{ level: 10, role: "active" }]);
});

test("removing an unknown role does nothing", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  removeReward(db, "g", "nobody");

  assert.equal(getRewards(db, "g").length, 1);
});

test("rewards are separate for each guild", () => {
  const db = createDatabase();
  setReward(db, "a", 5, "regular");
  setReward(db, "b", 5, "regular");
  removeReward(db, "a", "regular");

  assert.equal(getRewards(db, "a").length, 0);
  assert.equal(getRewards(db, "b").length, 1);
});

test("the database rejects a level below 1", () => {
  const db = createDatabase();
  assert.throws(() => setReward(db, "g", 0, "regular"));
  assert.throws(() => setReward(db, "g", -3, "regular"));
});

test("a rejected level keeps the role's previous reward", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  assert.throws(() => setReward(db, "g", 0, "regular"));

  assert.deepEqual(getRewards(db, "g"), [{ level: 5, role: "regular" }]);
});
