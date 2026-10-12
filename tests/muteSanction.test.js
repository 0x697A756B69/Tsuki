const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");
const { setLadder } = require("../utils/warnLadder");
const {
  insertWarning,
  noteSanction,
  registerWarning,
  canApply,
  liftTarget,
  applySanction,
  liftSanction,
  enforceWarning,
  retractWarning,
} = require("../utils/warnSanctions");

const MINUTE = 60 * 1000;
const STEP = { sanction: "timeout", minutes: 10 };

function createDatabase({ muteType = "role", muteRole = "mute" } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateAutomodSettings(db, "g", { muteType, muteRole }, "admin");
  setLadder(db, "g", [{ warns: 1, sanction: "timeout", minutes: 10 }]);
  return db;
}

function createMember(
  calls = [],
  { hasRole = false, failAdd = false, timestamp = null } = {},
) {
  return {
    moderatable: true,
    manageable: true,
    kickable: true,
    communicationDisabledUntilTimestamp: timestamp,
    roles: {
      cache: new Map(hasRole ? [["mute", { id: "mute" }]] : []),
      add: async (id, reason) => {
        if (failAdd) throw new Error("Missing Permissions");
        calls.push(["add", id, reason]);
      },
      remove: async (id, reason) => calls.push(["remove", id, reason]),
    },
    timeout: async (ms, reason) => {
      calls.push(["timeout", ms, reason]);
      return { communicationDisabledUntilTimestamp: 90_000 };
    },
    kick: async (reason) => calls.push(["kick", reason]),
  };
}

function createGuild(roleExists = true) {
  const roles = new Map(roleExists ? [["mute", { id: "mute" }]] : []);
  return {
    id: "g",
    name: "Serveur",
    roles: {
      cache: roles,
      create: async () => {
        const role = { id: "fresh" };
        roles.set("fresh", role);
        return role;
      },
    },
    channels: { cache: new Map() },
    bans: { create: async () => {}, remove: async () => {} },
  };
}

test("canApply needs to manage the member in mute role mode", () => {
  assert.equal(canApply({ manageable: true }, STEP, true), true);
  assert.equal(
    canApply({ manageable: false, moderatable: true }, STEP, true),
    false,
  );
  assert.equal(canApply({ manageable: true, moderatable: false }, STEP), false);
});

test("applySanction gives the mute role instead of a timeout", async () => {
  const calls = [];
  const result = await applySanction({
    guild: createGuild(),
    member: createMember(calls),
    userId: "u",
    step: STEP,
    reason: "Spam",
    now: 1_000,
    muteRoleId: "mute",
  });

  assert.deepEqual(calls, [["add", "mute", "Spam"]]);
  assert.deepEqual(result, {
    sanction: "timeout",
    timeoutUntil: 1_000 + 10 * MINUTE,
  });
});

test("applySanction gives up quietly when the role cannot be added", async () => {
  const member = createMember([], { failAdd: true });

  assert.equal(
    await applySanction({
      guild: createGuild(),
      member,
      userId: "u",
      step: STEP,
      reason: "Spam",
      now: 1_000,
      muteRoleId: "mute",
    }),
    null,
  );
});

test("applySanction keeps kicks and bans out of the mute role", async () => {
  const calls = [];
  const member = createMember(calls);

  await applySanction({
    guild: createGuild(),
    member,
    userId: "u",
    step: { sanction: "kick", minutes: null },
    reason: "Spam",
    now: 1_000,
    muteRoleId: "mute",
  });

  assert.deepEqual(calls, [["kick", "Spam"]]);
});

test("liftTarget lifts the mute role while it is still running", () => {
  const warning = { sanction: "timeout", timeoutUntil: 5_000 };

  assert.equal(
    liftTarget(warning, createMember([], { hasRole: true }), 1_000, "mute"),
    "mute",
  );
});

test("liftTarget ignores a member without the mute role", () => {
  const warning = { sanction: "timeout", timeoutUntil: 5_000 };

  assert.equal(liftTarget(warning, createMember(), 1_000, "mute"), null);
});

test("liftTarget ignores a mute that already ended", () => {
  const warning = { sanction: "timeout", timeoutUntil: 5_000 };

  assert.equal(
    liftTarget(warning, createMember([], { hasRole: true }), 6_000, "mute"),
    null,
  );
});

test("liftTarget still lifts a Discord timeout when no mute role is saved", () => {
  const warning = { sanction: "timeout", timeoutUntil: 5_000 };
  const member = createMember([], {
    timestamp: 5_000,
  });

  assert.equal(liftTarget(warning, member, 1_000), "timeout");
});

test("liftSanction removes the mute role", async () => {
  const calls = [];

  const target = await liftSanction({
    guild: createGuild(),
    member: createMember(calls, { hasRole: true }),
    userId: "u",
    warning: { sanction: "timeout", timeoutUntil: 5_000 },
    reason: "Retiré",
    now: 1_000,
    muteRoleId: "mute",
  });

  assert.equal(target, "mute");
  assert.deepEqual(calls, [["remove", "mute", "Retiré"]]);
});

test("enforceWarning gives the mute role in mute role mode and notes it", async () => {
  const db = createDatabase();
  const calls = [];
  insertWarning(db, {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 1_000,
  });
  const warning = registerWarning(db, {
    id: "WARN-2",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 2_000,
  });

  const { applied } = await enforceWarning({
    db,
    guild: createGuild(),
    user: null,
    member: createMember(calls),
    warning,
    now: 2_000,
  });

  assert.equal(applied.sanction, "timeout");
  assert.equal(applied.timeoutUntil, 2_000 + 10 * MINUTE);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "add");
  assert.equal(calls[0][1], "mute");
  assert.equal(
    db.prepare("SELECT timeout_until FROM warns WHERE id = 'WARN-2'").get()
      .timeout_until,
    2_000 + 10 * MINUTE,
  );
});

test("enforceWarning creates the mute role when it is missing", async () => {
  const db = createDatabase({ muteRole: null });
  const calls = [];
  const warning = registerWarning(db, {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 1_000,
  });

  const { applied } = await enforceWarning({
    db,
    guild: createGuild(false),
    user: null,
    member: createMember(calls),
    warning,
    now: 1_000,
  });

  assert.equal(applied.sanction, "timeout");
  assert.equal(calls[0][1], "fresh");
  assert.equal(getAutomodSettings(db, "g").muteRole, "fresh");
});

test("enforceWarning applies nothing when the mute role cannot be created", async () => {
  const db = createDatabase({ muteRole: null });
  const guild = createGuild(false);
  guild.roles.create = async () => {
    throw new Error("Missing Permissions");
  };
  const calls = [];
  const warning = registerWarning(db, {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 1_000,
  });

  const { applied } = await enforceWarning({
    db,
    guild,
    user: null,
    member: createMember(calls),
    warning,
    now: 1_000,
  });

  assert.equal(applied, null);
  assert.deepEqual(calls, []);
});

test("enforceWarning keeps the Discord timeout in the default mode", async () => {
  const db = createDatabase({ muteType: "timeout", muteRole: null });
  const calls = [];
  const warning = registerWarning(db, {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 1_000,
  });

  await enforceWarning({
    db,
    guild: createGuild(),
    user: null,
    member: createMember(calls),
    warning,
    now: 1_000,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "timeout");
});

test("retractWarning removes the mute role when the warning is lifted", async () => {
  const db = createDatabase();
  const calls = [];
  insertWarning(db, {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 1_000,
  });
  noteSanction(db, "WARN-1", "timeout", Date.now() + 10 * MINUTE);

  const result = await retractWarning({
    db,
    guild: createGuild(),
    userId: "u",
    warningId: "WARN-1",
    member: createMember(calls, { hasRole: true }),
    reason: "Retiré",
  });

  assert.deepEqual(result, { removed: true, lifted: "mute" });
  assert.deepEqual(calls, [["remove", "mute", "Retiré"]]);
});
