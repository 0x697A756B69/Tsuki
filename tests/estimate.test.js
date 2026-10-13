const test = require("node:test");
const assert = require("node:assert/strict");
const { xpPerMinute, minutesToLevel } = require("../utils/estimate");

const defaults = { xpMin: 10, xpMax: 20, cooldown: 60 };

test("xpPerMinute uses the average gain and the cooldown", () => {
  assert.equal(xpPerMinute(defaults), 15);
  assert.equal(xpPerMinute({ ...defaults, cooldown: 30 }), 30);
  assert.equal(xpPerMinute({ ...defaults, cooldown: 120 }), 7.5);
});

test("xpPerMinute assumes nobody writes faster than every 15 seconds", () => {
  assert.equal(xpPerMinute({ ...defaults, cooldown: 0 }), 60);
  assert.equal(xpPerMinute({ ...defaults, cooldown: 5 }), 60);
});

test("minutesToLevel follows the level formula", () => {
  assert.equal(minutesToLevel(defaults, 1), 100 / 15);
  assert.equal(Math.round(minutesToLevel(defaults, 10)), 312);
});

test("minutesToLevel is infinite when no XP can be earned", () => {
  assert.equal(
    minutesToLevel({ ...defaults, xpMin: 0, xpMax: 0 }, 10),
    Infinity,
  );
});
