const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { addXp } = require("../utils/xp");
const { totalXpForLevel } = require("../utils/levels");
const {
  NEW_MEMBER_TRUST,
  TRUSTED_TRUST,
  trustFactor,
  rulePoints,
  infractionRisk,
  getMemberLevel,
} = require("../utils/riskScore");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;
const SETTINGS = { pointsWords: 2, pointsSpam: 1, pointsMentions: 3 };

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("trustFactor raises the stakes for a member who just arrived", () => {
  assert.equal(
    trustFactor({ joinedAt: NOW - 3 * DAY, level: 0, now: NOW }),
    NEW_MEMBER_TRUST,
  );
  assert.equal(trustFactor({ joinedAt: NOW, level: 0, now: NOW }), 1.5);
});

test("trustFactor stops treating a member as new after seven days", () => {
  assert.equal(trustFactor({ joinedAt: NOW - 7 * DAY, level: 0, now: NOW }), 1);
  assert.equal(
    trustFactor({ joinedAt: NOW - 7 * DAY + 1, level: 0, now: NOW }),
    1.5,
  );
});

test("trustFactor softens the score of a long-standing member", () => {
  assert.equal(
    trustFactor({ joinedAt: NOW - 90 * DAY, level: 0, now: NOW }),
    1,
  );
  assert.equal(
    trustFactor({ joinedAt: NOW - 90 * DAY - 1, level: 0, now: NOW }),
    TRUSTED_TRUST,
  );
});

test("trustFactor trusts a member of level 10 or more", () => {
  assert.equal(
    trustFactor({ joinedAt: NOW - 30 * DAY, level: 9, now: NOW }),
    1,
  );
  assert.equal(
    trustFactor({ joinedAt: NOW - 30 * DAY, level: 10, now: NOW }),
    0.5,
  );
});

test("trustFactor lets a recent arrival outweigh a high level", () => {
  assert.equal(trustFactor({ joinedAt: NOW - DAY, level: 50, now: NOW }), 1.5);
});

test("trustFactor ignores the arrival date when it is unknown", () => {
  assert.equal(trustFactor({ joinedAt: null, level: 0, now: NOW }), 1);
  assert.equal(trustFactor({ joinedAt: null, level: 12, now: NOW }), 0.5);
  assert.equal(trustFactor({ now: NOW }), 1);
});

test("rulePoints reads the points of each rule", () => {
  assert.equal(rulePoints(SETTINGS, "words"), 2);
  assert.equal(rulePoints(SETTINGS, "spam"), 1);
  assert.equal(rulePoints(SETTINGS, "mentions"), 3);
});

test("rulePoints rejects an unknown rule", () => {
  assert.throws(() => rulePoints(SETTINGS, "links"), TypeError);
});

test("infractionRisk freezes the points and the trust of one infraction", () => {
  assert.deepEqual(
    infractionRisk({
      settings: SETTINGS,
      ruleKey: "mentions",
      joinedAt: NOW - DAY,
      level: 0,
      now: NOW,
    }),
    { points: 3, trust: 1.5 },
  );
});

test("getMemberLevel is zero for a member without XP", () => {
  assert.equal(getMemberLevel(createDatabase(), "g", "u"), 0);
});

test("getMemberLevel reads the level from the total XP", () => {
  const db = createDatabase();
  addXp(db, "g", "u", totalXpForLevel(10));
  addXp(db, "g", "other", totalXpForLevel(3) + 5);
  assert.equal(getMemberLevel(db, "g", "u"), 10);
  assert.equal(getMemberLevel(db, "g", "other"), 3);
  assert.equal(getMemberLevel(db, "elsewhere", "u"), 0);
});
