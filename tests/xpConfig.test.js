const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseGains,
  parseVoiceGain,
  parseRewardLevel,
  rewardRoleError,
} = require("../utils/xpConfig");

test("parseGains reads valid values", () => {
  assert.deepEqual(parseGains({ min: "15", max: " 25 ", cooldown: "30" }), {
    gains: { xpMin: 15, xpMax: 25, cooldown: 30 },
  });
});

test("parseGains rejects values that are not whole numbers", () => {
  for (const min of ["", "abc", "-5", "2.5", "1e3"])
    assert.match(
      parseGains({ min, max: "20", cooldown: "60" }).error,
      /L'XP minimum/,
    );
});

test("parseGains rejects values above the limits", () => {
  assert.match(
    parseGains({ min: "10", max: "5000", cooldown: "60" }).error,
    /L'XP maximum/,
  );
  assert.match(
    parseGains({ min: "10", max: "20", cooldown: "9999" }).error,
    /Le cooldown/,
  );
});

test("parseGains rejects a minimum above the maximum", () => {
  assert.match(
    parseGains({ min: "30", max: "20", cooldown: "60" }).error,
    /ne peut pas dépasser/,
  );
});

test("parseRewardLevel reads a level between 1 and 100", () => {
  assert.deepEqual(parseRewardLevel(" 10 "), { level: 10 });
  assert.deepEqual(parseRewardLevel("1"), { level: 1 });
  assert.deepEqual(parseRewardLevel("100"), { level: 100 });
});

test("parseRewardLevel rejects anything else", () => {
  for (const value of ["", "0", "101", "-3", "2.5", "abc", "1e1"])
    assert.match(parseRewardLevel(value).error, /entre 1 et 100/);
});

test("rewardRoleError accepts a role the bot can give", () => {
  assert.equal(rewardRoleError({ id: "r", editable: true }, "g"), null);
});

test("rewardRoleError refuses roles the bot cannot give", () => {
  assert.match(rewardRoleError(undefined, "g"), /n'existe plus/);
  assert.match(rewardRoleError({ id: "g", editable: true }, "g"), /@everyone/);
  assert.match(
    rewardRoleError({ id: "r", managed: true, editable: false }, "g"),
    /intégration/,
  );
  assert.match(
    rewardRoleError({ id: "r", editable: false }, "g"),
    /au-dessus du mien/,
  );
});

test("parseVoiceGain reads a whole number between 0 and 1000", () => {
  assert.deepEqual(parseVoiceGain(" 25 "), { gain: 25 });
  assert.deepEqual(parseVoiceGain("0"), { gain: 0 });
  assert.deepEqual(parseVoiceGain("1000"), { gain: 1000 });
});

test("parseVoiceGain rejects anything else", () => {
  for (const value of ["", "-1", "1001", "2.5", "abc", "1e2"])
    assert.match(parseVoiceGain(value).error, /entre 0 et 1000/);
});
