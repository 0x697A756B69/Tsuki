const test = require("node:test");
const assert = require("node:assert/strict");
const {
  xpToNextLevel,
  totalXpForLevel,
  getLevelProgress,
} = require("../utils/levels");

test("xpToNextLevel follows 5N² + 50N + 100", () => {
  assert.equal(xpToNextLevel(0), 100);
  assert.equal(xpToNextLevel(1), 155);
  assert.equal(xpToNextLevel(2), 220);
  assert.equal(xpToNextLevel(10), 1100);
});

test("totalXpForLevel adds up every previous level", () => {
  assert.equal(totalXpForLevel(0), 0);
  assert.equal(totalXpForLevel(1), 100);
  assert.equal(totalXpForLevel(2), 255);
  assert.equal(totalXpForLevel(3), 475);

  for (let level = 0; level < 500; level++)
    assert.equal(
      totalXpForLevel(level + 1) - totalXpForLevel(level),
      xpToNextLevel(level),
    );
});

test("getLevelProgress at the start", () => {
  assert.deepEqual(getLevelProgress(0), {
    level: 0,
    current: 0,
    required: 100,
  });
  assert.deepEqual(getLevelProgress(99), {
    level: 0,
    current: 99,
    required: 100,
  });
});

test("getLevelProgress at a level boundary", () => {
  assert.deepEqual(getLevelProgress(100), {
    level: 1,
    current: 0,
    required: 155,
  });
  assert.deepEqual(getLevelProgress(254), {
    level: 1,
    current: 154,
    required: 155,
  });
  assert.deepEqual(getLevelProgress(255), {
    level: 2,
    current: 0,
    required: 220,
  });
});

test("getLevelProgress matches totalXpForLevel", () => {
  for (let level = 0; level < 500; level++) {
    const { level: found, current } = getLevelProgress(totalXpForLevel(level));
    assert.equal(found, level);
    assert.equal(current, 0);
  }
});

test("getLevelProgress treats negative XP as zero", () => {
  assert.deepEqual(getLevelProgress(-50), {
    level: 0,
    current: 0,
    required: 100,
  });
});
