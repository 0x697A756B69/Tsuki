const test = require("node:test");
const assert = require("node:assert/strict");
const { parseGains } = require("../utils/xpConfig");

test("parseGains reads valid values", () => {
  assert.deepEqual(parseGains({ min: "15", max: " 25 ", cooldown: "30" }), {
    gains: { xpMin: 15, xpMax: 25, cooldown: 30 },
  });
});

test("parseGains rejects values that are not whole numbers", () => {
  for (const min of ["", "abc", "-5", "2.5", "1e3"])
    assert.match(parseGains({ min, max: "20", cooldown: "60" }).error, /L'XP minimum/);
});

test("parseGains rejects values above the limits", () => {
  assert.match(parseGains({ min: "10", max: "5000", cooldown: "60" }).error, /L'XP maximum/);
  assert.match(parseGains({ min: "10", max: "20", cooldown: "9999" }).error, /Le cooldown/);
});

test("parseGains rejects a minimum above the maximum", () => {
  assert.match(
    parseGains({ min: "30", max: "20", cooldown: "60" }).error,
    /ne peut pas dépasser/,
  );
});
