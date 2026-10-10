const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { updateAutomodSettings } = require("../utils/automodSettings");
const { setLadder } = require("../utils/warnLadder");
const {
  insertWarning,
  noteSanction,
  listWarnings,
  removeWarning,
  registerWarning,
  canApply,
  liftTarget,
  applySanction,
  liftSanction,
  enforceWarning,
  issueWarning,
  retractWarning,
  warningSanction,
} = require("../utils/warnSanctions");

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function warning(changes = {}) {
  return {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: 1_000,
    ...changes,
  };
}

function createMember(calls = [], changes = {}) {
  return {
    moderatable: true,
    kickable: true,
    bannable: true,
    communicationDisabledUntilTimestamp: null,
    timeout: async (ms, reason) => {
      calls.push(["timeout", ms, reason]);
      return { communicationDisabledUntilTimestamp: 90_000 };
    },
    kick: async (reason) => calls.push(["kick", reason]),
    ...changes,
  };
}

function createGuild(calls = []) {
  return {
    id: "g",
    name: "Serveur",
    bans: {
      create: async (id, options) => calls.push(["ban", id, options.reason]),
      remove: async (id, reason) => calls.push(["unban", id, reason]),
    },
  };
}

test("insertWarning writes the warning with no sanction yet", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM warns").get() },
    {
      id: "WARN-1",
      guild: "g",
      user: "u",
      author: "mod",
      reason: "Spam",
      date: 1_000,
      sanction: null,
      timeout_until: null,
    },
  );
});

test("noteSanction remembers the sanction and its end", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  noteSanction(db, "WARN-1", "timeout", 5_000);
  const row = db.prepare("SELECT sanction, timeout_until FROM warns").get();
  assert.equal(row.sanction, "timeout");
  assert.equal(row.timeout_until, 5_000);
});

test("listWarnings sorts the newest first and marks the expired ones", () => {
  const db = createDatabase();
  insertWarning(db, warning({ id: "OLD", date: 1_000 }));
  insertWarning(db, warning({ id: "NEW", date: 10 * DAY }));
  const list = listWarnings(db, "g", "u", 5, 11 * DAY);
  assert.deepEqual(
    list.map((item) => [item.id, item.active]),
    [
      ["NEW", true],
      ["OLD", false],
    ],
  );
  assert.equal(list[0].expiresAt, 15 * DAY);
});

test("listWarnings never expires a warning when the duration is zero", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  const [item] = listWarnings(db, "g", "u", 0, 1_000 * DAY);
  assert.equal(item.active, true);
  assert.equal(item.expiresAt, null);
});

test("listWarnings keeps guilds and members apart", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  assert.equal(listWarnings(db, "h", "u", 30).length, 0);
  assert.equal(listWarnings(db, "g", "someone", 30).length, 0);
});

test("warningSanction reads the sanction without removing the warning", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  assert.equal(warningSanction(db, "g", "u", "WARN-1"), null);
  noteSanction(db, "WARN-1", "timeout", 9_000);
  assert.deepEqual(warningSanction(db, "g", "u", "WARN-1"), {
    sanction: "timeout",
    timeoutUntil: 9_000,
  });
  assert.equal(listWarnings(db, "g", "u", 30).length, 1);
});

test("warningSanction ignores other guilds, members and ids", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  noteSanction(db, "WARN-1", "ban");
  assert.equal(warningSanction(db, "h", "u", "WARN-1"), null);
  assert.equal(warningSanction(db, "g", "someone", "WARN-1"), null);
  assert.equal(warningSanction(db, "g", "u", "nope"), null);
});

test("removeWarning gives back the sanction it carried", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  noteSanction(db, "WARN-1", "timeout", 5_000);
  assert.deepEqual(removeWarning(db, "g", "u", "WARN-1"), {
    sanction: "timeout",
    timeoutUntil: 5_000,
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM warns").get().n, 0);
});

test("removeWarning deletes only the matching warning", () => {
  const db = createDatabase();
  insertWarning(db, warning());
  insertWarning(db, warning({ id: "WARN-2" }));
  assert.equal(removeWarning(db, "other", "u", "WARN-1"), null);
  assert.equal(removeWarning(db, "g", "someone", "WARN-1"), null);
  assert.notEqual(removeWarning(db, "g", "u", "WARN-1"), null);
  assert.equal(removeWarning(db, "g", "u", "WARN-1"), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM warns").get().n, 1);
});

test("registerWarning counts the active warnings and picks the step", () => {
  const db = createDatabase();
  const first = registerWarning(db, warning());
  assert.equal(first.count, 1);
  assert.equal(first.step.sanction, null);
  assert.deepEqual(first.next, { warns: 2, sanction: "timeout", minutes: 10 });
  const second = registerWarning(db, warning({ id: "WARN-2", date: 2_000 }));
  assert.equal(second.count, 2);
  assert.deepEqual(second.step, { warns: 2, sanction: "timeout", minutes: 10 });
  assert.equal(second.userId, "u");
  assert.equal(second.validDays, 30);
});

test("registerWarning leaves expired warnings out of the count", () => {
  const db = createDatabase();
  insertWarning(db, warning({ id: "OLD", date: 1 }));
  const result = registerWarning(db, warning({ id: "NEW", date: 100 * DAY }));
  assert.equal(result.count, 1);
});

test("registerWarning counts everything when warnings never expire", () => {
  const db = createDatabase();
  updateAutomodSettings(db, "g", { warnValidDays: 0 }, "admin");
  insertWarning(db, warning({ id: "OLD", date: 1 }));
  const result = registerWarning(db, warning({ id: "NEW", date: 100 * DAY }));
  assert.equal(result.count, 2);
});

test("registerWarning has no next step after the last sanction", () => {
  const db = createDatabase();
  setLadder(db, "g", [{ warns: 1, sanction: "ban", minutes: null }]);
  assert.equal(registerWarning(db, warning()).next, null);
});

test("canApply checks what Tsuki can do to the member", () => {
  const timeout = { warns: 2, sanction: "timeout", minutes: 10 };
  const kick = { warns: 3, sanction: "kick", minutes: null };
  const ban = { warns: 4, sanction: "ban", minutes: null };
  assert.equal(canApply(createMember(), timeout), true);
  assert.equal(
    canApply(createMember([], { moderatable: false }), timeout),
    false,
  );
  assert.equal(canApply(createMember(), kick), true);
  assert.equal(canApply(createMember([], { kickable: false }), kick), false);
  assert.equal(canApply(createMember(), ban), true);
  assert.equal(canApply(createMember([], { bannable: false }), ban), false);
  assert.equal(canApply(null, ban), true);
  assert.equal(canApply(null, timeout), false);
  assert.equal(canApply(null, kick), false);
});

test("canApply is false for a step without sanction", () => {
  assert.equal(
    canApply(createMember(), { warns: 1, sanction: null, minutes: null }),
    false,
  );
  assert.equal(canApply(createMember(), null), false);
});

test("liftTarget lifts a ban at any time", () => {
  assert.equal(
    liftTarget({ sanction: "ban", timeoutUntil: null }, null),
    "ban",
  );
});

test("liftTarget never lifts a kick", () => {
  assert.equal(
    liftTarget({ sanction: "kick", timeoutUntil: null }, null),
    null,
  );
});

test("liftTarget only lifts the timeout Tsuki set and that still runs", () => {
  const set = { sanction: "timeout", timeoutUntil: 500 };
  const member = (until) => ({ communicationDisabledUntilTimestamp: until });
  assert.equal(liftTarget(set, member(500), 100), "timeout");
  assert.equal(liftTarget(set, member(900), 100), null);
  assert.equal(liftTarget(set, member(null), 100), null);
  assert.equal(liftTarget(set, member(500), 600), null);
  assert.equal(liftTarget(set, null, 100), null);
  assert.equal(
    liftTarget({ sanction: null, timeoutUntil: null }, member(500)),
    null,
  );
  assert.equal(liftTarget(null, member(500)), null);
});

test("applySanction times the member out and reports the real end", async () => {
  const calls = [];
  const result = await applySanction({
    guild: createGuild(),
    member: createMember(calls),
    userId: "u",
    step: { warns: 2, sanction: "timeout", minutes: 10 },
    reason: "raison",
    now: 0,
  });
  assert.deepEqual(calls, [["timeout", 10 * MINUTE, "raison"]]);
  assert.deepEqual(result, { sanction: "timeout", timeoutUntil: 90_000 });
});

test("applySanction computes the end itself when Discord gives none", async () => {
  const member = createMember([], { timeout: async () => ({}) });
  const result = await applySanction({
    guild: createGuild(),
    member,
    userId: "u",
    step: { warns: 2, sanction: "timeout", minutes: 10 },
    reason: "r",
    now: 1_000,
  });
  assert.equal(result.timeoutUntil, 1_000 + 10 * MINUTE);
});

test("applySanction kicks and bans", async () => {
  const calls = [];
  const kick = await applySanction({
    guild: createGuild(calls),
    member: createMember(calls),
    userId: "u",
    step: { warns: 3, sanction: "kick", minutes: null },
    reason: "r",
    now: 0,
  });
  const ban = await applySanction({
    guild: createGuild(calls),
    member: null,
    userId: "u",
    step: { warns: 4, sanction: "ban", minutes: null },
    reason: "r",
    now: 0,
  });
  assert.deepEqual(calls, [
    ["kick", "r"],
    ["ban", "u", "r"],
  ]);
  assert.deepEqual(kick, { sanction: "kick", timeoutUntil: null });
  assert.deepEqual(ban, { sanction: "ban", timeoutUntil: null });
});

test("applySanction gives up quietly when Discord refuses", async () => {
  const member = createMember([], {
    timeout: async () => {
      throw new Error("Missing Permissions");
    },
  });
  const result = await applySanction({
    guild: createGuild(),
    member,
    userId: "u",
    step: { warns: 2, sanction: "timeout", minutes: 10 },
    reason: "r",
    now: 0,
  });
  assert.equal(result, null);
});

test("applySanction does nothing out of reach", async () => {
  const calls = [];
  const result = await applySanction({
    guild: createGuild(calls),
    member: createMember(calls, { moderatable: false }),
    userId: "u",
    step: { warns: 2, sanction: "timeout", minutes: 10 },
    reason: "r",
    now: 0,
  });
  assert.equal(result, null);
  assert.equal(calls.length, 0);
});

test("liftSanction ends the timeout and unbans", async () => {
  const calls = [];
  const lifted = await liftSanction({
    guild: createGuild(calls),
    member: createMember(calls, { communicationDisabledUntilTimestamp: 500 }),
    userId: "u",
    warning: { sanction: "timeout", timeoutUntil: 500 },
    reason: "r",
    now: 100,
  });
  const unbanned = await liftSanction({
    guild: createGuild(calls),
    member: null,
    userId: "u",
    warning: { sanction: "ban", timeoutUntil: null },
    reason: "r",
    now: 100,
  });
  assert.equal(lifted, "timeout");
  assert.equal(unbanned, "ban");
  assert.deepEqual(calls, [
    ["timeout", null, "r"],
    ["unban", "u", "r"],
  ]);
});

test("liftSanction leaves a timeout set by someone else", async () => {
  const calls = [];
  const lifted = await liftSanction({
    guild: createGuild(calls),
    member: createMember(calls, { communicationDisabledUntilTimestamp: 900 }),
    userId: "u",
    warning: { sanction: "timeout", timeoutUntil: 500 },
    reason: "r",
    now: 100,
  });
  assert.equal(lifted, null);
  assert.equal(calls.length, 0);
});

test("enforceWarning sends the notice, applies the step and notes it", async () => {
  const db = createDatabase();
  const calls = [];
  const sent = [];
  const plan = registerWarning(db, warning());
  const second = registerWarning(db, warning({ id: "WARN-2", date: 2_000 }));
  const outcome = await enforceWarning({
    db,
    guild: createGuild(calls),
    user: { send: async (payload) => sent.push(payload) },
    member: createMember(calls),
    warning: second,
    now: 2_000,
  });
  assert.equal(plan.count, 1);
  assert.equal(outcome.delivered, true);
  assert.deepEqual(outcome.applied, {
    sanction: "timeout",
    timeoutUntil: 90_000,
  });
  assert.equal(sent.length, 1);
  const row = db
    .prepare("SELECT sanction, timeout_until FROM warns WHERE id = 'WARN-2'")
    .get();
  assert.equal(row.sanction, "timeout");
  assert.equal(row.timeout_until, 90_000);
});

test("enforceWarning notices before a ban takes the member away", async () => {
  const db = createDatabase();
  setLadder(db, "g", [{ warns: 1, sanction: "ban", minutes: null }]);
  const order = [];
  const result = registerWarning(db, warning());
  await enforceWarning({
    db,
    guild: {
      ...createGuild(),
      bans: { create: async () => order.push("ban") },
    },
    user: { send: async () => order.push("dm") },
    member: createMember(),
    warning: result,
  });
  assert.deepEqual(order, ["dm", "ban"]);
});

test("enforceWarning reports closed DMs and still applies the step", async () => {
  const db = createDatabase();
  const calls = [];
  registerWarning(db, warning());
  const second = registerWarning(db, warning({ id: "WARN-2", date: 2_000 }));
  const outcome = await enforceWarning({
    db,
    guild: createGuild(calls),
    user: {
      send: async () => {
        throw new Error("closed");
      },
    },
    member: createMember(calls),
    warning: second,
  });
  assert.equal(outcome.delivered, false);
  assert.equal(calls.length, 1);
});

test("enforceWarning passes the components with the notice", async () => {
  const db = createDatabase();
  const sent = [];
  await enforceWarning({
    db,
    guild: createGuild(),
    user: { send: async (payload) => sent.push(payload) },
    member: createMember(),
    warning: registerWarning(db, warning()),
    components: ["row"],
  });
  assert.deepEqual(sent[0].components, ["row"]);
});

test("enforceWarning tells nobody when the user is unknown", async () => {
  const db = createDatabase();
  const outcome = await enforceWarning({
    db,
    guild: createGuild(),
    user: null,
    member: null,
    warning: registerWarning(db, warning()),
  });
  assert.equal(outcome.delivered, false);
});

test("enforceWarning leaves the warning unsanctioned when Discord refuses", async () => {
  const db = createDatabase();
  registerWarning(db, warning());
  const second = registerWarning(db, warning({ id: "WARN-2", date: 2_000 }));
  const member = createMember([], {
    timeout: async () => {
      throw new Error("nope");
    },
  });
  const outcome = await enforceWarning({
    db,
    guild: createGuild(),
    user: { send: async () => {} },
    member,
    warning: second,
  });
  assert.equal(outcome.applied, null);
  assert.equal(
    db.prepare("SELECT sanction FROM warns WHERE id = 'WARN-2'").get().sanction,
    null,
  );
});

test("issueWarning registers then enforces in one go", async () => {
  const db = createDatabase();
  const calls = [];
  const sent = [];
  const guild = createGuild(calls);
  const member = createMember(calls);
  const user = { send: async (payload) => sent.push(payload) };
  const input = {
    db,
    guild,
    user,
    member,
    userId: "u",
    authorId: "mod",
    reason: "Spam",
  };
  const first = await issueWarning({ ...input, id: "WARN-1", date: 1_000 });
  const second = await issueWarning({ ...input, id: "WARN-2", date: 2_000 });
  assert.equal(first.count, 1);
  assert.equal(first.applied, null);
  assert.equal(second.count, 2);
  assert.equal(second.applied.sanction, "timeout");
  assert.equal(second.delivered, true);
  assert.equal(sent.length, 2);
});

test("retractWarning removes the warning and lifts its timeout", async () => {
  const db = createDatabase();
  const calls = [];
  insertWarning(db, warning());
  noteSanction(db, "WARN-1", "timeout", 500);
  const result = await retractWarning({
    db,
    guild: createGuild(calls),
    userId: "u",
    warningId: "WARN-1",
    member: createMember(calls, { communicationDisabledUntilTimestamp: 500 }),
    reason: "r",
    now: 100,
  });
  assert.deepEqual(result, { removed: true, lifted: "timeout" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM warns").get().n, 0);
  assert.deepEqual(calls, [["timeout", null, "r"]]);
});

test("retractWarning unbans a banned member", async () => {
  const db = createDatabase();
  const calls = [];
  insertWarning(db, warning());
  noteSanction(db, "WARN-1", "ban");
  const result = await retractWarning({
    db,
    guild: createGuild(calls),
    userId: "u",
    warningId: "WARN-1",
    member: null,
    reason: "r",
  });
  assert.deepEqual(result, { removed: true, lifted: "ban" });
  assert.deepEqual(calls, [["unban", "u", "r"]]);
});

test("retractWarning keeps a kick as it is", async () => {
  const db = createDatabase();
  insertWarning(db, warning());
  noteSanction(db, "WARN-1", "kick");
  const result = await retractWarning({
    db,
    guild: createGuild(),
    userId: "u",
    warningId: "WARN-1",
    member: null,
    reason: "r",
  });
  assert.deepEqual(result, { removed: true, lifted: null });
});

test("retractWarning does nothing for an unknown warning", async () => {
  const calls = [];
  const result = await retractWarning({
    db: createDatabase(),
    guild: createGuild(calls),
    userId: "u",
    warningId: "nope",
    member: createMember(calls),
    reason: "r",
  });
  assert.deepEqual(result, { removed: false, lifted: null });
  assert.equal(calls.length, 0);
});
