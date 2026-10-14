const test = require("node:test");
const assert = require("node:assert/strict");
const {
  KINDS,
  describeFailure,
  summarizeCauses,
} = require("../utils/core/failure");

test("describeFailure recognises a permission or hierarchy refusal", () => {
  assert.equal(describeFailure({ code: 50013 }), KINDS.permissions);
  assert.equal(describeFailure({ code: 50001 }), KINDS.permissions);
  assert.equal(
    describeFailure(new Error("Missing Permissions")),
    KINDS.permissions,
  );
});

test("describeFailure recognises a member that is gone", () => {
  assert.equal(describeFailure({ code: 10007 }), KINDS.missing);
  assert.equal(describeFailure({ code: 10013 }), KINDS.missing);
  assert.equal(describeFailure(new Error("Member not found")), KINDS.missing);
});

test("describeFailure recognises a rate limit", () => {
  assert.equal(describeFailure({ status: 429 }), KINDS.rateLimit);
  assert.equal(describeFailure(new Error("Rate limited")), KINDS.rateLimit);
});

test("describeFailure falls back to an unknown error", () => {
  assert.equal(describeFailure(new Error("boom")), KINDS.unknown);
  assert.equal(describeFailure(null), KINDS.unknown);
  assert.equal(describeFailure({ code: "ECONNRESET" }), KINDS.unknown);
});

test("summarizeCauses lists each cause once", () => {
  assert.equal(
    summarizeCauses([KINDS.permissions, KINDS.missing, KINDS.permissions]),
    `${KINDS.permissions}, ${KINDS.missing}`,
  );
  assert.equal(summarizeCauses([]), "");
});
