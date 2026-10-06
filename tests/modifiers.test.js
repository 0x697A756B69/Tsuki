const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getModifiers,
  setModifier,
  computeMultiplier,
} = require("../utils/modifiers");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function modifiers({ role = {}, channel = {} } = {}) {
  return {
    role: new Map(Object.entries(role)),
    channel: new Map(Object.entries(channel)),
  };
}

function compute(
  mods,
  { channelId = "c", parentId = null, roleIds = [] } = {},
  bonus,
) {
  return computeMultiplier(mods, { channelId, parentId, roleIds }, bonus);
}

test("setModifier saves, updates and reads modifiers", () => {
  const db = createDatabase();
  setModifier(db, "g", "role", "booster", 1.5);
  setModifier(db, "g", "channel", "spam", 0);
  setModifier(db, "g", "role", "booster", 2);

  const mods = getModifiers(db, "g");
  assert.deepEqual([...mods.role], [["booster", 2]]);
  assert.deepEqual([...mods.channel], [["spam", 0]]);
});

test("setting a modifier to ×1 removes it", () => {
  const db = createDatabase();
  setModifier(db, "g", "role", "booster", 1.5);
  setModifier(db, "g", "role", "booster", 1);

  assert.equal(getModifiers(db, "g").role.size, 0);
});

test("modifiers are separate for each guild", () => {
  const db = createDatabase();
  setModifier(db, "a", "role", "booster", 1.5);
  assert.equal(getModifiers(db, "b").role.size, 0);
});

test("the database rejects invalid modifiers", () => {
  const db = createDatabase();
  assert.throws(() => setModifier(db, "g", "role", "x", 5));
  assert.throws(() => setModifier(db, "g", "role", "x", -1));
  assert.throws(() => setModifier(db, "g", "member", "x", 1.5));
});

test("no modifier means ×1", () => {
  assert.equal(compute(modifiers()), 1);
});

test("an excluded channel gives no XP", () => {
  const mods = modifiers({ channel: { c: 0 }, role: { booster: 2 } });
  assert.equal(compute(mods, { roleIds: ["booster"] }), 0);
});

test("an excluded role wins over every bonus", () => {
  const mods = modifiers({ role: { muted: 0, booster: 2 } });
  assert.equal(compute(mods, { roleIds: ["booster", "muted"] }), 0);
});

test("only the best role counts", () => {
  const mods = modifiers({ role: { booster: 1.5, vip: 1.25, slow: 0.5 } });
  assert.equal(
    compute(mods, { roleIds: ["slow", "vip", "booster", "other"] }),
    1.5,
  );
});

test("channel and role bonuses multiply", () => {
  const mods = modifiers({ channel: { c: 1.25 }, role: { booster: 1.5 } });
  assert.equal(compute(mods, { roleIds: ["booster"] }), 1.875);
});

test("threads inherit the bonus of their parent channel", () => {
  const mods = modifiers({ channel: { spam: 0, debates: 1.5 } });
  assert.equal(compute(mods, { channelId: "thread", parentId: "spam" }), 0);
  assert.equal(
    compute(mods, { channelId: "thread", parentId: "debates" }),
    1.5,
  );
});

test("a thread's own modifier overrides its parent", () => {
  const mods = modifiers({ channel: { thread: 2, debates: 1.5 } });
  assert.equal(compute(mods, { channelId: "thread", parentId: "debates" }), 2);
});

test("the total multiplier never goes above ×3", () => {
  const mods = modifiers({ channel: { c: 2 }, role: { booster: 2 } });
  assert.equal(compute(mods, { roleIds: ["booster"] }, 1.25), 3);
});
