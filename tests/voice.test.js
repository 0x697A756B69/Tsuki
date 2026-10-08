const test = require("node:test");
const assert = require("node:assert/strict");
const { voiceEligibleMembers } = require("../utils/voice");

function member(id, options = {}) {
  return {
    id,
    bot: false,
    selfMute: false,
    selfDeaf: false,
    ...options,
  };
}

test("every human in a channel with company is eligible", () => {
  assert.deepEqual(
    voiceEligibleMembers("c", [member("a"), member("b"), member("c")]),
    ["a", "b", "c"],
  );
});

test("a member alone in the channel is not eligible", () => {
  assert.deepEqual(voiceEligibleMembers("c", [member("a")]), []);
  assert.deepEqual(voiceEligibleMembers("c", []), []);
});

test("bots are never eligible and do not count as company", () => {
  assert.deepEqual(
    voiceEligibleMembers("c", [member("a"), member("bot", { bot: true })]),
    [],
  );
  assert.deepEqual(
    voiceEligibleMembers("c", [
      member("a"),
      member("b"),
      member("bot", { bot: true }),
    ]),
    ["a", "b"],
  );
});

test("members who muted or deafened themselves are not eligible", () => {
  assert.deepEqual(
    voiceEligibleMembers("c", [
      member("a"),
      member("b", { selfMute: true }),
      member("c", { selfDeaf: true }),
    ]),
    ["a"],
  );
});

test("a muted or deafened member still counts as company", () => {
  assert.deepEqual(
    voiceEligibleMembers("c", [
      member("a"),
      member("b", { selfMute: true, selfDeaf: true }),
    ]),
    ["a"],
  );
});

test("nobody earns XP in the AFK channel", () => {
  assert.deepEqual(
    voiceEligibleMembers("afk", [member("a"), member("b")], "afk"),
    [],
  );
  assert.deepEqual(
    voiceEligibleMembers("c", [member("a"), member("b")], "afk"),
    ["a", "b"],
  );
});
