const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BURST_WINDOW,
  SIGNAL_LABELS,
  getJoinSignals,
  isSuspect,
  normalizeName,
} = require("../../utils/raid/joinSignals");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1700000000000;

const SETTINGS = {
  accountDays: 7,
  signalAge: true,
  signalAvatar: true,
  signalNames: true,
  signalBurst: true,
  signalInvite: true,
};

function member(overrides = {}) {
  return {
    user: "me",
    name: "alice",
    createdAt: NOW - 400 * DAY,
    joinedAt: NOW,
    hasAvatar: true,
    invite: null,
    ...overrides,
  };
}

function join(user, overrides = {}) {
  return {
    user,
    name: `other${user}x`,
    createdAt: NOW - 200 * DAY,
    joinedAt: NOW - 1000,
    invite: null,
    ...overrides,
  };
}

test("normalizeName lowercases and removes digits and symbols", () => {
  assert.equal(normalizeName("Spam_Bot_4821"), "spambot");
  assert.equal(normalizeName("  Léa-99 "), "léa");
  assert.equal(normalizeName("1234"), "");
  assert.equal(normalizeName(null), "");
});

test("a regular member has no signal", () => {
  assert.deepEqual(getJoinSignals(member(), [], SETTINGS), []);
});

test("age flags an account younger than the limit", () => {
  const fresh = member({ createdAt: NOW - 3 * DAY });
  assert.deepEqual(getJoinSignals(fresh, [], SETTINGS), ["age"]);

  const edge = member({ createdAt: NOW - 7 * DAY });
  assert.deepEqual(getJoinSignals(edge, [], SETTINGS), []);
});

test("avatar flags an account without an avatar", () => {
  assert.deepEqual(getJoinSignals(member({ hasAvatar: false }), [], SETTINGS), [
    "avatar",
  ]);
});

test("names flags a name with the same shape once digits are removed", () => {
  const recent = [join("a", { name: "Spam_Bot_4821" })];

  assert.deepEqual(
    getJoinSignals(member({ name: "spam_bot_77" }), recent, SETTINGS),
    ["names"],
  );
  assert.deepEqual(
    getJoinSignals(member({ name: "spam_bat_77" }), recent, SETTINGS),
    [],
  );
});

test("names ignores shapes that are too short to compare", () => {
  const recent = [join("a", { name: "12" }), join("b", { name: "ab1" })];

  assert.deepEqual(
    getJoinSignals(member({ name: "34" }), recent, SETTINGS),
    [],
  );
  assert.deepEqual(
    getJoinSignals(member({ name: "ab2" }), recent, SETTINGS),
    [],
  );
});

test("burst needs two other accounts created close to this one", () => {
  const created = NOW - 100 * DAY;
  const near = (user, shift) => join(user, { createdAt: created + shift });
  const target = member({ createdAt: created });

  assert.deepEqual(getJoinSignals(target, [near("a", 1000)], SETTINGS), []);
  assert.deepEqual(
    getJoinSignals(
      target,
      [near("a", 1000), near("b", -BURST_WINDOW)],
      SETTINGS,
    ),
    ["burst"],
  );
  assert.deepEqual(
    getJoinSignals(
      target,
      [near("a", 1000), near("b", BURST_WINDOW + 1)],
      SETTINGS,
    ),
    [],
  );
});

test("invite needs two other joins through the same invite", () => {
  const target = member({ invite: "abc" });
  const via = (user, invite) => join(user, { invite });

  assert.deepEqual(getJoinSignals(target, [via("a", "abc")], SETTINGS), []);
  assert.deepEqual(
    getJoinSignals(target, [via("a", "abc"), via("b", "abc")], SETTINGS),
    ["invite"],
  );
  assert.deepEqual(
    getJoinSignals(target, [via("a", "abc"), via("b", "xyz")], SETTINGS),
    [],
  );
});

test("a member without a known invite never gets the invite signal", () => {
  const recent = [join("a"), join("b"), join("c")];

  assert.deepEqual(getJoinSignals(member(), recent, SETTINGS), []);
});

test("the member is never compared with their own earlier record", () => {
  const recent = [
    join("me", { name: "alice", invite: "abc" }),
    join("a", { invite: "abc" }),
  ];

  assert.deepEqual(
    getJoinSignals(member({ invite: "abc" }), recent, SETTINGS),
    [],
  );
});

test("signals come back in a stable order", () => {
  const created = NOW - 2 * DAY;
  const target = member({
    name: "bot_1",
    createdAt: created,
    hasAvatar: false,
    invite: "abc",
  });
  const recent = [
    join("a", { name: "bot_2", createdAt: created, invite: "abc" }),
    join("b", { name: "bot_3", createdAt: created, invite: "abc" }),
  ];

  assert.deepEqual(getJoinSignals(target, recent, SETTINGS), [
    "age",
    "avatar",
    "names",
    "burst",
    "invite",
  ]);
});

test("a disabled signal is never reported", () => {
  const created = NOW - 2 * DAY;
  const target = member({ createdAt: created, hasAvatar: false });
  const settings = { ...SETTINGS, signalAge: false, signalAvatar: false };

  assert.deepEqual(getJoinSignals(target, [], settings), []);
});

test("accountDays changes how recent an account must be", () => {
  const target = member({ createdAt: NOW - 10 * DAY });

  assert.deepEqual(getJoinSignals(target, [], SETTINGS), []);
  assert.deepEqual(
    getJoinSignals(target, [], { ...SETTINGS, accountDays: 30 }),
    ["age"],
  );
});

test("isSuspect needs at least two signals", () => {
  assert.equal(isSuspect([]), false);
  assert.equal(isSuspect(["age"]), false);
  assert.equal(isSuspect(["age", "avatar"]), true);
});

test("every signal has a French label", () => {
  assert.deepEqual(Object.keys(SIGNAL_LABELS).sort(), [
    "age",
    "avatar",
    "burst",
    "invite",
    "names",
  ]);
  for (const label of Object.values(SIGNAL_LABELS))
    assert.equal(typeof label, "string");
});
