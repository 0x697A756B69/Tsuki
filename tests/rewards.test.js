const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getRewards,
  setReward,
  removeReward,
  rewardRoleFor,
  syncRewardRoles,
  updateRewardRoles,
} = require("../utils/rewards");

const REWARDS = [
  { level: 5, role: "regular" },
  { level: 10, role: "active" },
  { level: 25, role: "veteran" },
];

function fakeMember({ held = [], guildRoles = REWARDS.map((r) => r.role) }) {
  const calls = [];
  return {
    calls,
    guild: { roles: { cache: new Map(guildRoles.map((id) => [id, {}])) } },
    roles: {
      cache: new Map(held.map((id) => [id, {}])),
      add: async (role) => calls.push(["add", role]),
      remove: async (roles) => calls.push(["remove", roles]),
    },
  };
}

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

test("rewards are listed by level", () => {
  const db = createDatabase();
  setReward(db, "g", 25, "veteran");
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");

  assert.deepEqual(getRewards(db, "g"), [
    { level: 5, role: "regular" },
    { level: 10, role: "active" },
    { level: 25, role: "veteran" },
  ]);
});

test("a guild without rewards has an empty list", () => {
  assert.deepEqual(getRewards(createDatabase(), "g"), []);
});

test("a new role replaces the one already set at that level", () => {
  const db = createDatabase();
  setReward(db, "g", 10, "active");
  setReward(db, "g", 10, "hero");

  assert.deepEqual(getRewards(db, "g"), [{ level: 10, role: "hero" }]);
});

test("a role moves to its new level instead of being duplicated", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  setReward(db, "g", 15, "regular");

  assert.deepEqual(getRewards(db, "g"), [
    { level: 10, role: "active" },
    { level: 15, role: "regular" },
  ]);
});

test("moving a role onto a taken level replaces that level's role", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  setReward(db, "g", 10, "regular");

  assert.deepEqual(getRewards(db, "g"), [{ level: 10, role: "regular" }]);
});

test("removeReward deletes the reward of a role", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  removeReward(db, "g", "regular");

  assert.deepEqual(getRewards(db, "g"), [{ level: 10, role: "active" }]);
});

test("removing an unknown role does nothing", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  removeReward(db, "g", "nobody");

  assert.equal(getRewards(db, "g").length, 1);
});

test("rewards are separate for each guild", () => {
  const db = createDatabase();
  setReward(db, "a", 5, "regular");
  setReward(db, "b", 5, "regular");
  removeReward(db, "a", "regular");

  assert.equal(getRewards(db, "a").length, 0);
  assert.equal(getRewards(db, "b").length, 1);
});

test("the database rejects a level below 1", () => {
  const db = createDatabase();
  assert.throws(() => setReward(db, "g", 0, "regular"));
  assert.throws(() => setReward(db, "g", -3, "regular"));
});

test("a rejected level keeps the role's previous reward", () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  assert.throws(() => setReward(db, "g", 0, "regular"));

  assert.deepEqual(getRewards(db, "g"), [{ level: 5, role: "regular" }]);
});

test("rewardRoleFor gives no role below the first level", () => {
  assert.equal(rewardRoleFor(REWARDS, 0), null);
  assert.equal(rewardRoleFor(REWARDS, 4), null);
  assert.equal(rewardRoleFor([], 50), null);
});

test("rewardRoleFor gives the role of the highest level reached", () => {
  assert.equal(rewardRoleFor(REWARDS, 5), "regular");
  assert.equal(rewardRoleFor(REWARDS, 9), "regular");
  assert.equal(rewardRoleFor(REWARDS, 10), "active");
  assert.equal(rewardRoleFor(REWARDS, 99), "veteran");
});

test("rewardRoleFor does not depend on the order of the list", () => {
  assert.equal(rewardRoleFor([...REWARDS].reverse(), 12), "active");
});

test("syncRewardRoles gives the role of the level reached", async () => {
  const member = fakeMember({});
  const result = await syncRewardRoles(member, REWARDS, 7);

  assert.deepEqual(member.calls, [["add", "regular"]]);
  assert.deepEqual(result, { added: "regular", removed: [] });
});

test("syncRewardRoles replaces the previous reward role", async () => {
  const member = fakeMember({ held: ["regular"] });
  const result = await syncRewardRoles(member, REWARDS, 10);

  assert.deepEqual(member.calls, [
    ["add", "active"],
    ["remove", ["regular"]],
  ]);
  assert.deepEqual(result, { added: "active", removed: ["regular"] });
});

test("syncRewardRoles removes the role when the level drops", async () => {
  const member = fakeMember({ held: ["veteran"] });
  const result = await syncRewardRoles(member, REWARDS, 6);

  assert.deepEqual(result, { added: "regular", removed: ["veteran"] });
});

test("syncRewardRoles removes every reward role below the first level", async () => {
  const member = fakeMember({ held: ["regular", "active"] });
  const result = await syncRewardRoles(member, REWARDS, 0);

  assert.deepEqual(result, { added: null, removed: ["regular", "active"] });
});

test("syncRewardRoles does nothing when the roles are already right", async () => {
  const member = fakeMember({ held: ["active"] });
  const result = await syncRewardRoles(member, REWARDS, 12);

  assert.deepEqual(member.calls, []);
  assert.deepEqual(result, { added: null, removed: [] });
});

test("syncRewardRoles never touches roles that are not rewards", async () => {
  const member = fakeMember({ held: ["booster", "active"] });
  const result = await syncRewardRoles(member, REWARDS, 12);

  assert.deepEqual(result, { added: null, removed: [] });
});

test("syncRewardRoles skips a reward whose role was deleted", async () => {
  const member = fakeMember({ guildRoles: ["regular", "veteran"] });
  const result = await syncRewardRoles(member, REWARDS, 12);

  assert.deepEqual(member.calls, [["add", "regular"]]);
  assert.deepEqual(result, { added: "regular", removed: [] });
});

test("updateRewardRoles applies the rewards saved for the guild", async () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  setReward(db, "g", 10, "active");
  const member = fakeMember({ held: ["regular"] });

  const result = await updateRewardRoles(db, "g", member, 10);

  assert.deepEqual(result, { added: "active", removed: ["regular"] });
});

test("updateRewardRoles ignores the rewards of other guilds", async () => {
  const db = createDatabase();
  setReward(db, "other", 5, "regular");
  const member = fakeMember({});

  const result = await updateRewardRoles(db, "g", member, 10);

  assert.deepEqual(member.calls, []);
  assert.deepEqual(result, { added: null, removed: [] });
});

test("updateRewardRoles does nothing without rewards", async () => {
  const member = { roles: { cache: new Map() } };
  const result = await updateRewardRoles(createDatabase(), "g", member, 10);

  assert.deepEqual(result, { added: null, removed: [] });
});

test("updateRewardRoles reports a failure instead of throwing", async () => {
  const db = createDatabase();
  setReward(db, "g", 5, "regular");
  const member = fakeMember({});
  member.roles.add = async () => {
    throw new Error("Missing Permissions");
  };

  const result = await updateRewardRoles(db, "g", member, 10);

  assert.deepEqual(result, { added: null, removed: [], failed: true });
});
