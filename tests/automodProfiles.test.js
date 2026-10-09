const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROFILES,
  profileSettings,
  currentProfile,
  profileLabel,
} = require("../utils/automodProfiles");

const STANDARD = {
  sensitivity: 6,
  halfLifeDays: 3,
  pointsWords: 2,
  pointsSpam: 1,
  pointsMentions: 3,
};

test("there are three profiles, from calm to strict", () => {
  assert.deepEqual(Object.keys(PROFILES), ["calm", "standard", "strict"]);
  assert.deepEqual(
    Object.values(PROFILES).map((profile) => profile.label),
    ["Tranquille", "Standard", "Strict"],
  );
});

test("profileSettings gives the five risk settings of a profile", () => {
  assert.deepEqual(profileSettings("standard"), STANDARD);
  assert.deepEqual(profileSettings("calm"), {
    sensitivity: 10,
    halfLifeDays: 2,
    pointsWords: 1,
    pointsSpam: 1,
    pointsMentions: 2,
  });
  assert.deepEqual(profileSettings("strict"), {
    sensitivity: 3,
    halfLifeDays: 5,
    pointsWords: 3,
    pointsSpam: 2,
    pointsMentions: 4,
  });
});

test("profileSettings returns a copy and rejects unknown keys", () => {
  profileSettings("standard").sensitivity = 99;
  assert.equal(profileSettings("standard").sensitivity, 6);
  assert.equal(profileSettings("wild"), null);
  assert.equal(profileSettings("toString"), null);
});

test("currentProfile recognises the exact values of a profile", () => {
  for (const key of Object.keys(PROFILES))
    assert.equal(currentProfile({ ...profileSettings(key), other: 1 }), key);
});

test("currentProfile is null as soon as one value differs", () => {
  assert.equal(currentProfile({ ...STANDARD, sensitivity: 7 }), null);
  assert.equal(currentProfile({ ...STANDARD, pointsSpam: 2 }), null);
  assert.equal(currentProfile({ ...STANDARD, sensitivity: 0 }), null);
});

test("profileLabel names the profile or says Personnalisé", () => {
  assert.equal(profileLabel(STANDARD), "Standard");
  assert.equal(profileLabel(profileSettings("strict")), "Strict");
  assert.equal(profileLabel({ ...STANDARD, halfLifeDays: 4 }), "Personnalisé");
});
