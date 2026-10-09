const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { addXp } = require("../utils/xp");
const { totalXpForLevel } = require("../utils/levels");
const { addLog } = require("../utils/automodLogs");
const {
  NEW_MEMBER_TRUST,
  TRUSTED_TRUST,
  trustFactor,
  rulePoints,
  infractionRisk,
  formatNumber,
  getRiskScore,
  escalationFor,
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

let next = 0;

function infraction(db, changes = {}) {
  addLog(db, {
    guildId: "g",
    channelId: "log",
    messageId: `m${++next}`,
    userId: "u",
    points: 2,
    trust: 1,
    date: NOW,
    ...changes,
  });
}

const SCORE = { guildId: "g", userId: "u", halfLifeDays: 3, now: NOW };

test("formatNumber writes decimals with a comma", () => {
  assert.equal(formatNumber(4.5), "4,5");
  assert.equal(formatNumber(6), "6");
  assert.equal(formatNumber(1.25), "1,25");
});

test("getRiskScore is zero without infractions", () => {
  assert.equal(getRiskScore(createDatabase(), SCORE), 0);
});

test("getRiskScore weighs the points by the frozen trust", () => {
  const db = createDatabase();
  infraction(db, { points: 2, trust: 1.5 });
  infraction(db, { points: 3, trust: 0.5 });
  assert.equal(getRiskScore(db, SCORE), 4.5);
});

test("getRiskScore ignores an infraction whose points were taken off", () => {
  const db = createDatabase();
  infraction(db, { points: 2, trust: 1.5 });
  infraction(db, { points: 3, trust: 1 });
  db.prepare(
    "UPDATE automod_logs SET points = NULL, trust = NULL WHERE points = 2",
  ).run();
  assert.equal(getRiskScore(db, SCORE), 3);
});

test("getRiskScore halves the points every half-life", () => {
  const db = createDatabase();
  infraction(db, { points: 8, date: NOW - 3 * DAY });
  assert.equal(getRiskScore(db, SCORE), 4);
  infraction(db, { points: 4, date: NOW - 6 * DAY });
  assert.equal(getRiskScore(db, SCORE), 5);
  assert.equal(getRiskScore(db, { ...SCORE, halfLifeDays: 6 }), 7.66);
});

test("getRiskScore follows the half-life of the server", () => {
  const db = createDatabase();
  infraction(db, { points: 8, date: NOW - 3 * DAY });
  assert.equal(getRiskScore(db, { ...SCORE, halfLifeDays: 1 }), 1);
  assert.equal(getRiskScore(db, { ...SCORE, halfLifeDays: 30 }), 7.46);
});

test("getRiskScore forgets infractions older than 30 days", () => {
  const db = createDatabase();
  infraction(db, { points: 20, date: NOW - 30 * DAY });
  infraction(db, { points: 20, date: NOW - 31 * DAY });
  assert.equal(getRiskScore(db, { ...SCORE, halfLifeDays: 30 }), 0);
  infraction(db, { points: 4, date: NOW - 30 * DAY + 1 });
  assert.equal(getRiskScore(db, { ...SCORE, halfLifeDays: 30 }), 2);
});

test("getRiskScore only counts the member of the guild", () => {
  const db = createDatabase();
  infraction(db, { userId: "other" });
  infraction(db, { guildId: "elsewhere" });
  assert.equal(getRiskScore(db, SCORE), 0);
});

test("getRiskScore ignores logs without points", () => {
  const db = createDatabase();
  infraction(db, { points: null, trust: null });
  assert.equal(getRiskScore(db, SCORE), 0);
});

test("getRiskScore adds the infraction that is happening now", () => {
  const db = createDatabase();
  infraction(db, { points: 8, date: NOW - 3 * DAY });
  assert.equal(getRiskScore(db, { ...SCORE, extra: 3 }), 7);
  assert.equal(getRiskScore(createDatabase(), { ...SCORE, extra: 6 }), 6);
});

test("getRiskScore rounds to two decimals", () => {
  const db = createDatabase();
  infraction(db, { points: 1, date: NOW - DAY });
  assert.equal(getRiskScore(db, SCORE), 0.79);
});

const SANCTION = { sensitivity: 6, escalationMinutes: 30 };

test("escalationFor waits for the sensitivity", () => {
  assert.equal(escalationFor(SANCTION, 5.99), null);
  assert.deepEqual(escalationFor(SANCTION, 6), {
    minutes: 30,
    reason: "AutoMod : score de risque 6",
  });
  assert.equal(
    escalationFor(SANCTION, 7.5).reason,
    "AutoMod : score de risque 7,5",
  );
});

test("escalationFor is off when the sensitivity is 0", () => {
  assert.equal(escalationFor({ ...SANCTION, sensitivity: 0 }, 50), null);
});
