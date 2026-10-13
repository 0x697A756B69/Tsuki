const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDuration } = require("../utils/formatDuration");

test("formatDuration picks a readable unit", () => {
  assert.equal(formatDuration(0.2), "1 min");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(312), "5 h");
  assert.equal(formatDuration(47 * 60), "47 h");
  assert.equal(formatDuration(5 * 24 * 60), "5 j");
  assert.equal(formatDuration(Infinity), "jamais");
});
