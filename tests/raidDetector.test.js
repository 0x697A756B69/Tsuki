const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MINUTE,
  TIERS,
  countRecent,
  evaluateRaid,
  rawTier,
  tierRank,
} = require("../utils/raid/raidDetector");

const NOW = 1700000000000;

const SETTINGS = {
  scope: "all",
  windowMinutes: 10,
  calmMinutes: 10,
  watchJoins: 5,
  alertJoins: 8,
  raidJoins: 10,
};

function arrivals(count, startMinute = 0, signals = []) {
  return Array.from({ length: count }, (_, index) => ({
    user: `u${startMinute}-${index}`,
    joinedAt: NOW + startMinute * MINUTE + index * 1000,
    signals,
  }));
}

function simulate(joins, minutes, settings = SETTINGS) {
  let state = null;
  const steps = [];
  for (const minute of minutes) {
    state = evaluateRaid({
      joins,
      settings,
      previous: state,
      now: NOW + minute * MINUTE,
    });
    steps.push({ minute, tier: state.tier, changed: state.changed });
  }
  return steps;
}

test("tierRank orders the tiers from calm to raid", () => {
  assert.deepEqual(TIERS.map(tierRank), [0, 1, 2, 3]);
  assert.equal(tierRank("nothing"), -1);
});

test("rawTier picks the highest threshold reached", () => {
  assert.equal(rawTier(0, SETTINGS), "calm");
  assert.equal(rawTier(4, SETTINGS), "calm");
  assert.equal(rawTier(5, SETTINGS), "watch");
  assert.equal(rawTier(7, SETTINGS), "watch");
  assert.equal(rawTier(8, SETTINGS), "alert");
  assert.equal(rawTier(9, SETTINGS), "alert");
  assert.equal(rawTier(10, SETTINGS), "raid");
  assert.equal(rawTier(50, SETTINGS), "raid");
});

test("rawTier handles equal thresholds by taking the highest tier", () => {
  const settings = { ...SETTINGS, watchJoins: 4, alertJoins: 4, raidJoins: 4 };

  assert.equal(rawTier(4, settings), "raid");
});

test("countRecent only counts joins inside the window", () => {
  const joins = [
    { user: "old", joinedAt: NOW - 1, signals: [] },
    { user: "edge", joinedAt: NOW, signals: [] },
    { user: "in", joinedAt: NOW + 5 * MINUTE, signals: [] },
    { user: "end", joinedAt: NOW + 10 * MINUTE, signals: [] },
    { user: "future", joinedAt: NOW + 10 * MINUTE + 1, signals: [] },
  ];

  assert.equal(countRecent(joins, SETTINGS, NOW + 10 * MINUTE), 3);
});

test("countRecent follows the window setting", () => {
  const joins = arrivals(3, 0).concat(arrivals(2, 25));

  assert.equal(
    countRecent(joins, { ...SETTINGS, windowMinutes: 5 }, NOW + 27 * MINUTE),
    2,
  );
  assert.equal(
    countRecent(joins, { ...SETTINGS, windowMinutes: 30 }, NOW + 27 * MINUTE),
    5,
  );
});

test("countRecent counts only suspect joins in the suspect scope", () => {
  const joins = [
    ...arrivals(3, 0, ["age", "avatar"]),
    ...arrivals(4, 1, ["age"]),
    ...arrivals(2, 2, []),
  ];
  const now = NOW + 3 * MINUTE;

  assert.equal(countRecent(joins, { ...SETTINGS, scope: "all" }, now), 9);
  assert.equal(countRecent(joins, { ...SETTINGS, scope: "suspect" }, now), 3);
});

test("a quiet server stays calm and never reports a change", () => {
  const steps = simulate(arrivals(3, 0), [0, 5, 10, 20]);

  assert.deepEqual(
    steps.map((step) => [step.tier, step.changed]),
    [
      ["calm", false],
      ["calm", false],
      ["calm", false],
      ["calm", false],
    ],
  );
});

test("the tier rises as soon as a threshold is reached", () => {
  const joins = [...arrivals(5, 0), ...arrivals(3, 2), ...arrivals(2, 4)];
  const steps = simulate(joins, [1, 3, 5]);

  assert.deepEqual(
    steps.map((step) => [step.tier, step.changed]),
    [
      ["watch", true],
      ["alert", true],
      ["raid", true],
    ],
  );
});

test("the tier can jump over the middle tiers", () => {
  const result = evaluateRaid({
    joins: arrivals(12, 0),
    settings: SETTINGS,
    previous: { tier: "calm", heldAt: NOW },
    now: NOW + MINUTE,
  });

  assert.equal(result.tier, "raid");
  assert.equal(result.count, 12);
  assert.equal(result.changed, true);
});

test("the tier is held until the calm delay has passed", () => {
  const joins = arrivals(10, 0);
  const steps = simulate(joins, [1, 10, 11, 14, 20, 21]);

  assert.deepEqual(
    steps.map((step) => [step.minute, step.tier, step.changed]),
    [
      [1, "raid", true],
      [10, "raid", false],
      [11, "raid", false],
      [14, "raid", false],
      [20, "calm", true],
      [21, "calm", false],
    ],
  );
});

test("the calm delay starts from the last time the tier was justified", () => {
  const joins = [...arrivals(10, 0), ...arrivals(10, 8)];
  const steps = simulate(joins, [1, 9, 17, 18, 27, 28]);

  assert.deepEqual(
    steps.map((step) => [step.minute, step.tier]),
    [
      [1, "raid"],
      [9, "raid"],
      [17, "raid"],
      [18, "raid"],
      [27, "raid"],
      [28, "calm"],
    ],
  );
});

test("a lower tier does not renew the hold of a higher one", () => {
  const joins = [...arrivals(10, 0), ...arrivals(6, 12)];
  const steps = simulate(joins, [1, 10, 13, 19, 20]);

  assert.deepEqual(
    steps.map((step) => [step.minute, step.tier]),
    [
      [1, "raid"],
      [10, "raid"],
      [13, "raid"],
      [19, "raid"],
      [20, "watch"],
    ],
  );
});

test("after the calm delay the tier falls to what the window justifies", () => {
  const result = evaluateRaid({
    joins: arrivals(8, 15),
    settings: SETTINGS,
    previous: { tier: "raid", heldAt: NOW },
    now: NOW + 20 * MINUTE,
  });

  assert.equal(result.tier, "alert");
  assert.equal(result.changed, true);
  assert.equal(result.heldAt, NOW + 20 * MINUTE);
});

test("a hold keeps its original date", () => {
  const result = evaluateRaid({
    joins: [],
    settings: SETTINGS,
    previous: { tier: "alert", heldAt: NOW },
    now: NOW + 4 * MINUTE,
  });

  assert.deepEqual(result, {
    tier: "alert",
    count: 0,
    heldAt: NOW,
    changed: false,
  });
});

test("reaching the held tier again renews the hold", () => {
  const result = evaluateRaid({
    joins: arrivals(8, 5),
    settings: SETTINGS,
    previous: { tier: "alert", heldAt: NOW },
    now: NOW + 6 * MINUTE,
  });

  assert.equal(result.tier, "alert");
  assert.equal(result.heldAt, NOW + 6 * MINUTE);
  assert.equal(result.changed, false);
});

test("without a previous state the server starts calm", () => {
  assert.deepEqual(evaluateRaid({ joins: [], settings: SETTINGS, now: NOW }), {
    tier: "calm",
    count: 0,
    heldAt: NOW,
    changed: false,
  });
});

test("a raid made only of normal accounts is ignored in the suspect scope", () => {
  const settings = { ...SETTINGS, scope: "suspect" };
  const normal = simulate(arrivals(20, 0), [1], settings);
  const suspect = simulate(arrivals(20, 0, ["age", "names"]), [1], settings);

  assert.equal(normal[0].tier, "calm");
  assert.equal(suspect[0].tier, "raid");
});

test("a longer calm delay holds the tier longer", () => {
  const settings = { ...SETTINGS, calmMinutes: 60 };
  const steps = simulate(arrivals(10, 0), [1, 40, 60, 61], settings);

  assert.deepEqual(
    steps.map((step) => step.tier),
    ["raid", "raid", "raid", "calm"],
  );
});
