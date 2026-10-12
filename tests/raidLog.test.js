const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  RETENTION,
  recordJoin,
  getJoinsSince,
  recordTier,
  getLastTier,
  purgeRaidLogs,
} = require("../utils/raidLog");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

const NOW = 1700000000000;

test("getJoinsSince returns the recent joins in order with their signals", () => {
  const db = createDatabase();
  recordJoin(db, {
    guild: "g",
    user: "b",
    joinedAt: NOW + 2000,
    createdAt: NOW - 5000,
    signals: ["age", "avatar"],
    invite: "abc",
  });
  recordJoin(db, {
    guild: "g",
    user: "a",
    joinedAt: NOW + 1000,
    createdAt: NOW - 9000,
  });
  recordJoin(db, { guild: "g", user: "old", joinedAt: NOW - 1, createdAt: 0 });

  assert.deepEqual(getJoinsSince(db, "g", NOW), [
    {
      user: "a",
      joinedAt: NOW + 1000,
      createdAt: NOW - 9000,
      signals: [],
      invite: null,
    },
    {
      user: "b",
      joinedAt: NOW + 2000,
      createdAt: NOW - 5000,
      signals: ["age", "avatar"],
      invite: "abc",
    },
  ]);
});

test("getJoinsSince only returns the joins of the given guild", () => {
  const db = createDatabase();
  recordJoin(db, { guild: "a", user: "u", joinedAt: NOW, createdAt: 0 });

  assert.deepEqual(getJoinsSince(db, "b", 0), []);
});

test("recordJoin keeps one row when the same join is recorded twice", () => {
  const db = createDatabase();
  const join = { guild: "g", user: "u", joinedAt: NOW, createdAt: 0 };
  recordJoin(db, join);
  recordJoin(db, { ...join, signals: ["names"] });

  const joins = getJoinsSince(db, "g", 0);
  assert.equal(joins.length, 1);
  assert.deepEqual(joins[0].signals, ["names"]);
});

test("getLastTier returns null without any tier", () => {
  assert.equal(getLastTier(createDatabase(), "g"), null);
});

test("getLastTier returns the latest tier of the guild", () => {
  const db = createDatabase();
  recordTier(db, "g", "watch", 5, false, NOW);
  recordTier(db, "g", "raid", 11, true, NOW + 1000);
  recordTier(db, "other", "calm", 0, false, NOW + 5000);

  assert.deepEqual(getLastTier(db, "g"), {
    tier: "raid",
    joins: 11,
    observed: true,
    at: NOW + 1000,
  });
});

test("getLastTier prefers the latest record when two share a date", () => {
  const db = createDatabase();
  recordTier(db, "g", "alert", 8, false, NOW);
  recordTier(db, "g", "calm", 0, false, NOW);

  assert.equal(getLastTier(db, "g").tier, "calm");
});

test("recordTier rejects an unknown tier", () => {
  assert.throws(() => recordTier(createDatabase(), "g", "panic", 1));
});

test("purgeRaidLogs deletes joins and tiers older than 30 days", () => {
  const db = createDatabase();
  const old = NOW - RETENTION - 1;
  recordJoin(db, { guild: "g", user: "old", joinedAt: old, createdAt: 0 });
  recordJoin(db, {
    guild: "g",
    user: "edge",
    joinedAt: NOW - RETENTION,
    createdAt: 0,
  });
  recordTier(db, "g", "raid", 10, false, old);
  recordTier(db, "g", "calm", 0, false, NOW);

  assert.equal(purgeRaidLogs(db, NOW), 2);
  assert.deepEqual(
    getJoinsSince(db, "g", 0).map((join) => join.user),
    ["edge"],
  );
  assert.equal(getLastTier(db, "g").tier, "calm");
});

test("purgeRaidLogs returns 0 when nothing is old", () => {
  assert.equal(purgeRaidLogs(createDatabase(), NOW), 0);
});
