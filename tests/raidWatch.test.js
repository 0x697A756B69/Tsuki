const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { updateRaidSettings } = require("../utils/raidSettings");
const { MINUTE } = require("../utils/raidDetector");
const { getJoinsSince, getLastTier, recordTier } = require("../utils/raidLog");
const { getEntry, observeJoin, refreshRaid } = require("../utils/raidWatch");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1700000000000;

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function createSettings(db, changes = {}) {
  return updateRaidSettings(
    db,
    "g",
    {
      enabled: true,
      scope: "all",
      watchJoins: 3,
      alertJoins: 4,
      raidJoins: 5,
      ...changes,
    },
    "admin",
  );
}

function member(index, joinedAt, overrides = {}) {
  return {
    user: `u${index}`,
    name: `x${index}`,
    createdAt: NOW - (100 + index * 3) * DAY,
    joinedAt,
    hasAvatar: true,
    invite: null,
    ...overrides,
  };
}

function join(db, memory, settings, index, minute, overrides) {
  const now = NOW + minute * MINUTE;
  return observeJoin(
    db,
    memory,
    "g",
    member(index, now, overrides),
    settings,
    now,
  );
}

test("observeJoin records the join with its signals", () => {
  const db = createDatabase();
  const settings = createSettings(db);
  const result = join(db, new Map(), settings, 1, 0, {
    hasAvatar: false,
    createdAt: NOW - DAY,
  });

  assert.deepEqual(result.signals, ["age", "avatar"]);
  assert.deepEqual(getJoinsSince(db, "g", 0), [
    {
      user: "u1",
      joinedAt: NOW,
      createdAt: NOW - DAY,
      signals: ["age", "avatar"],
      invite: null,
    },
  ]);
});

test("observeJoin compares a join with the recent joins of the same guild", () => {
  const db = createDatabase();
  const settings = createSettings(db);
  const memory = new Map();
  join(db, memory, settings, 1, 0, { name: "Spam_Bot_11" });
  const second = join(db, memory, settings, 2, 1, { name: "spam_bot_22" });

  assert.deepEqual(second.signals, ["names"]);
});

test("observeJoin forgets joins that left the window", () => {
  const db = createDatabase();
  const settings = createSettings(db);
  const memory = new Map();
  join(db, memory, settings, 1, 0, { name: "Spam_Bot_11" });
  const late = join(db, memory, settings, 2, 11, { name: "spam_bot_22" });

  assert.deepEqual(late.signals, []);
  assert.equal(late.recent.length, 1);
  assert.equal(late.evaluation.count, 1);
});

test("observeJoin raises the tier once a threshold is reached and records it", () => {
  const db = createDatabase();
  const settings = createSettings(db);
  const memory = new Map();
  const steps = [1, 2, 3, 4, 5, 6].map(
    (index) => join(db, memory, settings, index, index).evaluation,
  );

  assert.deepEqual(
    steps.map((step) => [step.tier, step.changed]),
    [
      ["calm", false],
      ["calm", false],
      ["watch", true],
      ["alert", true],
      ["raid", true],
      ["raid", false],
    ],
  );
  assert.deepEqual(getLastTier(db, "g"), {
    tier: "raid",
    joins: 5,
    observed: false,
    at: NOW + 5 * MINUTE,
  });
});

test("observeJoin records the observation flag with the tier", () => {
  const db = createDatabase();
  const settings = createSettings(db, { observation: true });
  const memory = new Map();
  for (const index of [1, 2, 3]) join(db, memory, settings, index, 0);

  assert.equal(getLastTier(db, "g").observed, true);
});

test("observeJoin in the suspect scope ignores normal accounts", () => {
  const db = createDatabase();
  const settings = createSettings(db, { scope: "suspect" });
  const memory = new Map();
  let result;
  for (const index of [1, 2, 3, 4, 5, 6])
    result = join(db, memory, settings, index, 0);

  assert.equal(result.evaluation.tier, "calm");
  assert.equal(getLastTier(db, "g"), null);
});

test("refreshRaid returns to calm after the calm delay and records it", () => {
  const db = createDatabase();
  const settings = createSettings(db, { calmMinutes: 30 });
  const memory = new Map();
  for (const index of [1, 2, 3, 4, 5]) join(db, memory, settings, index, 0);

  const held = refreshRaid(db, memory, "g", settings, NOW + 15 * MINUTE);
  assert.equal(held.evaluation.tier, "raid");
  assert.equal(held.evaluation.changed, false);

  const calm = refreshRaid(db, memory, "g", settings, NOW + 30 * MINUTE);
  assert.equal(calm.evaluation.tier, "calm");
  assert.equal(calm.evaluation.changed, true);
  assert.equal(getLastTier(db, "g").tier, "calm");
});

test("refreshRaid resumes from the last recorded tier after a restart", () => {
  const db = createDatabase();
  const settings = createSettings(db);
  recordTier(db, "g", "raid", 9, false, NOW);

  const held = refreshRaid(db, new Map(), "g", settings, NOW + 5 * MINUTE);
  assert.equal(held.evaluation.tier, "raid");
  assert.equal(held.evaluation.changed, false);

  const calm = refreshRaid(db, new Map(), "g", settings, NOW + 10 * MINUTE);
  assert.equal(calm.evaluation.tier, "calm");
  assert.equal(calm.evaluation.changed, true);
});

test("refreshRaid keeps each guild apart", () => {
  const db = createDatabase();
  const settings = createSettings(db);
  const memory = new Map();
  for (const index of [1, 2, 3]) join(db, memory, settings, index, 0);

  const other = refreshRaid(db, memory, "other", settings, NOW);
  assert.equal(other.evaluation.count, 0);
  assert.equal(other.evaluation.tier, "calm");
});

test("getEntry creates a complete entry once per guild", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  const memory = new Map();
  const entry = getEntry(db, memory, "g");
  assert.deepEqual(
    { ...entry },
    { recent: [], state: null, handled: new Map(), freed: new Set() },
  );
  assert.equal(getEntry(db, memory, "g"), entry);
});
