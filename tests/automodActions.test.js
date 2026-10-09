const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");
const migrate = require("../loaders/migrate");
const { RULE_NAMES } = require("../utils/automodRules");
const { updateAutomodSettings } = require("../utils/automodSettings");
const {
  ACTION_ID,
  buildLogMessage,
  addLog,
  getLog,
  markContested,
} = require("../utils/automodLogs");
const { contestedPayload } = require("../utils/automodContest");
const {
  ACTIONS,
  parseAction,
  missingPermission,
  removeWarning,
  addModeratorWarning,
  canLiftTimeout,
  contestVerdict,
  banConfirmation,
} = require("../utils/automodActions");
const component = require("../components/automod-action");

const { ManageMessages, ModerateMembers, BanMembers } = PermissionFlagsBits;
const ALL = [ManageMessages, ModerateMembers, BanMembers];

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function insertWarning(db, id = "WARN-1", guild = "g", user = "u") {
  db.prepare(
    "INSERT INTO warns (id, guild, user, author, reason, date) VALUES (?, ?, ?, 'bot', 'x', 1)",
  ).run(id, guild, user);
}

function countWarns(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM warns").get().n;
}

function fakeMember(id, flags = [], position = 1, extra = {}) {
  return {
    id,
    guild: { ownerId: "owner" },
    permissions: new PermissionsBitField(flags),
    roles: {
      highest: {
        position,
        comparePositionTo(other) {
          return this.position - other.position;
        },
      },
    },
    moderatable: true,
    bannable: true,
    timeout: async () => {},
    ...extra,
  };
}

/** @returns {any} */
function logMessage(changes) {
  const message = buildLogMessage({
    ruleKey: "spam",
    ruleName: RULE_NAMES.spam,
    userId: "u",
    channelId: "c",
    warningTotal: 1,
    warningId: "WARN-1",
    messageId: "m",
    content: "texte",
    date: 1_000_000,
    ...changes,
  });
  return { id: "LOG", components: message.components };
}

/** @param {any} [options] */
function setup({ moderator, target, flags, message = logMessage() } = {}) {
  const db = createDatabase();
  const calls = {
    updates: [],
    replies: [],
    follow: [],
    bans: [],
    deleted: [],
    dms: [],
  };
  const timeouts = [];
  const member =
    target === null
      ? null
      : (target ??
        fakeMember("u", [], 1, {
          timeout: async (...args) => timeouts.push(args),
        }));
  const bot = /** @type {any} */ ({
    utils: { createId: async (prefix) => `${prefix}-9` },
    users: {
      fetch: async () => ({ send: async (text) => calls.dms.push(text) }),
    },
  });
  const interaction = /** @type {any} */ ({
    isButton: () => true,
    user: { id: "mod", tag: "mod#0" },
    member: moderator ?? fakeMember("mod", ALL, 5),
    memberPermissions: new PermissionsBitField(flags ?? ALL),
    message,
    channel: { messages: { fetch: async () => message } },
    guildId: "g",
    channelId: "log",
    guild: {
      id: "g",
      name: "Serveur",
      members: {
        fetch: async () => member ?? Promise.reject(new Error("unknown")),
      },
      channels: {
        fetch: async () => ({
          messages: { delete: async (id) => calls.deleted.push(id) },
        }),
      },
      bans: { create: async (...args) => calls.bans.push(args) },
    },
    update: async (payload) => calls.updates.push(payload),
    reply: async (payload) => calls.replies.push(payload),
    followUp: async (payload) => calls.follow.push(payload),
    deferUpdate: async () => calls.updates.push("deferred"),
    editReply: async (payload) => calls.updates.push(payload),
  });
  const run = (...params) => component.run(bot, interaction, params, db);
  return { db, calls, timeouts, run, message };
}

test("every action needs its permission, and cancelling needs none", () => {
  assert.equal(ACTIONS.remove.permission, ManageMessages);
  assert.equal(ACTIONS.warn.permission, ManageMessages);
  assert.equal(ACTIONS.delete.permission, ManageMessages);
  assert.equal(ACTIONS.close.permission, ManageMessages);
  assert.equal(ACTIONS.timeout.permission, ModerateMembers);
  assert.equal(ACTIONS.accept.permission, ManageMessages);
  assert.equal(ACTIONS.refuse.permission, ManageMessages);
  assert.equal(ACTIONS.ban.permission, BanMembers);
  assert.equal(ACTIONS.banok.permission, BanMembers);
  assert.equal(ACTIONS.bancancel.permission, null);
});

test("parseAction splits the action from its params", () => {
  assert.deepEqual(parseAction(["remove", "u", "WARN-1"]), {
    action: "remove",
    args: ["u", "WARN-1"],
  });
  assert.equal(parseAction(["nope", "u"]), null);
  assert.equal(parseAction(["toString"]), null);
  assert.equal(parseAction([]), null);
});

test("missingPermission names the permission that is missing", () => {
  const none = new PermissionsBitField([]);
  assert.match(missingPermission("remove", none), /Gérer les messages/);
  assert.match(missingPermission("timeout", none), /Modérer les membres/);
  assert.match(missingPermission("ban", none), /Bannir des membres/);
  assert.equal(missingPermission("bancancel", none), null);
  assert.equal(
    missingPermission("ban", new PermissionsBitField([BanMembers])),
    null,
  );
});

test("removeWarning deletes only the matching warning", () => {
  const db = createDatabase();
  insertWarning(db, "WARN-1");
  insertWarning(db, "WARN-2");
  assert.equal(removeWarning(db, "other", "u", "WARN-1"), false);
  assert.equal(removeWarning(db, "g", "someone", "WARN-1"), false);
  assert.equal(removeWarning(db, "g", "u", "WARN-1"), true);
  assert.equal(removeWarning(db, "g", "u", "WARN-1"), false);
  assert.equal(countWarns(db), 1);
});

test("addModeratorWarning writes the warning with the moderator as author", () => {
  const db = createDatabase();
  insertWarning(db, "OLD");
  const result = addModeratorWarning(db, {
    id: "WARN-5",
    guildId: "g",
    userId: "u",
    moderatorId: "mod",
    date: 7,
  });
  assert.deepEqual(result, {
    id: "WARN-5",
    reason: "AutoMod : message détecté",
    total: 2,
  });
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM warns WHERE id = 'WARN-5'").get() },
    {
      id: "WARN-5",
      guild: "g",
      user: "u",
      author: "mod",
      reason: "AutoMod : message détecté",
      date: 7,
    },
  );
});

test("banConfirmation is an ephemeral prompt with confirm and cancel", () => {
  const prompt = banConfirmation("u", "LOG");
  const row = prompt.components[0].toJSON();
  assert.deepEqual(
    /** @type {any[]} */ (row.components).map((button) => button.custom_id),
    [`${ACTION_ID}:banok:u:LOG`, `${ACTION_ID}:bancancel`],
  );
  assert.match(prompt.content, /<@u>/);
  assert.ok(prompt.flags);
});

test("a click without the permission is refused and changes nothing", async () => {
  const { db, calls, run } = setup({ flags: [] });
  insertWarning(db);
  await run("remove", "u", "WARN-1");
  assert.equal(calls.updates.length, 0);
  assert.match(calls.replies[0].content, /Gérer les messages/);
  assert.equal(countWarns(db), 1);
});

test("an unknown button answers that it is no longer active", async () => {
  const { calls, run } = setup();
  await run("nope");
  assert.match(calls.replies[0].content, /plus actif/);
});

test("remove deletes the warning and marks the log as handled", async () => {
  const { db, calls, run } = setup();
  insertWarning(db);
  await run("remove", "u", "WARN-1");
  assert.equal(countWarns(db), 0);
  const json = JSON.stringify(calls.updates[0].components[0]);
  assert.match(json, /Traité par <@mod> : avertissement retiré/);
  assert.doesNotMatch(json, /"type":1[,}]/);
});

test("close only marks the log as handled", async () => {
  const { db, calls, run } = setup();
  insertWarning(db);
  await run("close");
  assert.equal(countWarns(db), 1);
  assert.match(JSON.stringify(calls.updates[0]), /: classé/);
});

test("warn adds a warning written by the moderator", async () => {
  const message = logMessage({ observed: true, warningId: null });
  const { db, calls, run } = setup({ message });
  await run("warn", "u");
  const row = db.prepare("SELECT * FROM warns").get();
  assert.equal(row.author, "mod");
  assert.equal(row.id, "WARN-9");
  assert.match(JSON.stringify(calls.updates[0]), /avertissement ajouté/);
});

test("delete removes the offending message", async () => {
  const message = logMessage({ observed: true });
  const { calls, run } = setup({ message });
  await run("delete", "c", "m");
  assert.deepEqual(calls.deleted, ["m"]);
  assert.match(JSON.stringify(calls.updates[0]), /message supprimé/);
});

test("timeout uses the escalation duration of the server", async () => {
  const { db, calls, timeouts, run } = setup();
  updateAutomodSettings(db, "g", { escalationMinutes: 15 }, "admin");
  await run("timeout", "u");
  assert.equal(timeouts[0][0], 15 * 60 * 1000);
  assert.match(JSON.stringify(calls.updates[0]), /mis en sourdine/);
});

test("timeout refuses a member who is gone or out of reach", async () => {
  const gone = setup({ target: null });
  await gone.run("timeout", "u");
  assert.equal(gone.calls.updates.length, 0);
  assert.match(gone.calls.replies[0].content, /pas sur le serveur/);

  const target = fakeMember("u", [], 1, { moderatable: false });
  const out = setup({ target });
  await out.run("timeout", "u");
  assert.equal(out.calls.updates.length, 0);
  assert.match(out.calls.replies[0].content, /Je ne peux pas/);
});

test("a moderator cannot act on someone of equal or higher rank", async () => {
  const target = fakeMember("u", ALL, 5);
  const { db, calls, run } = setup({ target });
  insertWarning(db);
  await run("remove", "u", "WARN-1");
  await run("warn", "u");
  await run("timeout", "u");
  await run("ban", "u");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.replies.length, 4);
  assert.match(calls.replies[0].content, /Tu ne peux pas/);
  assert.equal(countWarns(db), 1);
});

test("ban asks for a confirmation before doing anything", async () => {
  const { calls, run } = setup();
  await run("ban", "u");
  assert.equal(calls.bans.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(
    calls.replies[0].components[0].toJSON().components[0].custom_id,
    `${ACTION_ID}:banok:u:LOG`,
  );
});

test("confirming the ban bans the member and marks the log", async () => {
  const { calls, run, message } = setup();
  message.edit = async (payload) => calls.updates.push(payload);
  await run("banok", "u", "LOG");
  assert.equal(calls.bans.length, 1);
  assert.equal(calls.bans[0][0], "u");
  assert.match(JSON.stringify(calls.updates[1]), /Traité par <@mod> : banni/);
  assert.match(calls.updates[2].content, /banni/);
});

test("confirming the ban twice bans only once", async () => {
  const { calls, run, message } = setup();
  message.edit = async (payload) => {
    calls.updates.push(payload);
    message.components = [{ toJSON: () => payload.components[0] }];
  };
  await run("banok", "u", "LOG");
  await run("banok", "u", "LOG");
  assert.equal(calls.bans.length, 1);
  assert.match(calls.updates.at(-1).content, /déjà été traité/);
});

test("cancelling the ban leaves the log alone", async () => {
  const { calls, run } = setup({ flags: [] });
  await run("bancancel");
  assert.equal(calls.bans.length, 0);
  assert.match(calls.updates[0].content, /annulé/);
});

const REF = { guildId: "g", channelId: "log", messageId: "LOG" };

function contested({ timeoutUntil = null, contest = true } = {}) {
  const payload = contestedPayload(logMessage().components[0].toJSON(), {
    reason: "faux positif",
  });
  const message = {
    id: "LOG",
    components: [{ toJSON: () => payload.components[0] }],
  };
  return { message, timeoutUntil, contest };
}

function setupContest({ timeoutUntil = null, memberUntil = null } = {}) {
  const { message } = contested();
  const timeouts = [];
  const target = fakeMember("u", [], 1, {
    communicationDisabledUntilTimestamp: memberUntil,
    timeout: async (...args) => timeouts.push(args),
  });
  const context = setup({ message, target });
  insertWarning(context.db);
  addLog(context.db, { ...REF, userId: "u", timeoutUntil, date: 1_000 });
  markContested(context.db, REF, 2_000);
  return { ...context, timeouts };
}

test("canLiftTimeout only matches the timeout Tsuki noted", () => {
  const log = { timeoutUntil: 500 };
  assert.equal(
    canLiftTimeout(log, { communicationDisabledUntilTimestamp: 500 }),
    true,
  );
  assert.equal(
    canLiftTimeout(log, { communicationDisabledUntilTimestamp: 900 }),
    false,
  );
  assert.equal(
    canLiftTimeout(log, { communicationDisabledUntilTimestamp: null }),
    false,
  );
  assert.equal(
    canLiftTimeout(
      { timeoutUntil: null },
      { communicationDisabledUntilTimestamp: null },
    ),
    false,
  );
  assert.equal(canLiftTimeout(log, null), false);
  assert.equal(canLiftTimeout(null, null), false);
});

test("contestVerdict tells the member the outcome", () => {
  assert.equal(
    contestVerdict("Serveur", false),
    "Ta contestation sur Serveur a été refusée : l'avertissement est maintenu.",
  );
  assert.equal(
    contestVerdict("Serveur", true),
    "Ta contestation sur Serveur a été acceptée : ton avertissement est retiré.",
  );
  assert.match(
    contestVerdict("Serveur", true, true),
    /et ta sourdine est levée/,
  );
});

test("accepting a contest removes the warning and tells the member", async () => {
  const { db, calls, run } = setupContest();
  await run("accept", "u", "WARN-1");
  assert.equal(countWarns(db), 0);
  assert.equal(getLog(db, REF).contestStatus, "accepted");
  assert.match(
    JSON.stringify(calls.updates[0]),
    /Traité par <@mod> : contestation acceptée/,
  );
  assert.match(calls.dms[0], /acceptée/);
});

test("accepting lifts the timeout Tsuki set", async () => {
  const { calls, timeouts, run } = setupContest({
    timeoutUntil: 7_000,
    memberUntil: 7_000,
  });
  await run("accept", "u", "WARN-1");
  assert.equal(timeouts[0][0], null);
  assert.match(calls.dms[0], /sourdine est levée/);
});

test("accepting keeps a timeout set by hand", async () => {
  const { calls, timeouts, run } = setupContest({
    timeoutUntil: 7_000,
    memberUntil: 9_000,
  });
  await run("accept", "u", "WARN-1");
  assert.equal(timeouts.length, 0);
  assert.doesNotMatch(calls.dms[0], /sourdine/);
});

test("accepting without a warning only settles the contest", async () => {
  const { db, run } = setupContest();
  await run("accept", "u", "-");
  assert.equal(countWarns(db), 1);
  assert.equal(getLog(db, REF).contestStatus, "accepted");
});

function giveRisk(db) {
  db.prepare("UPDATE automod_logs SET points = 2, trust = 1.5").run();
}

test("accepting a contest takes the points off the log", async () => {
  const { db, run } = setupContest();
  giveRisk(db);
  await run("accept", "u", "WARN-1");
  assert.equal(getLog(db, REF).points, null);
  assert.equal(getLog(db, REF).trust, null);
});

test("accepting without a warning still takes the points off", async () => {
  const { db, run } = setupContest();
  giveRisk(db);
  await run("accept", "u", "-");
  assert.equal(getLog(db, REF).points, null);
});

test("refusing a contest keeps the points", async () => {
  const { db, run } = setupContest();
  giveRisk(db);
  await run("refuse", "u");
  assert.equal(getLog(db, REF).points, 2);
  assert.equal(getLog(db, REF).trust, 1.5);
});

test("refusing a contest keeps the warning", async () => {
  const { db, calls, timeouts, run } = setupContest({
    timeoutUntil: 7_000,
    memberUntil: 7_000,
  });
  await run("refuse", "u");
  assert.equal(countWarns(db), 1);
  assert.equal(timeouts.length, 0);
  assert.equal(getLog(db, REF).contestStatus, "refused");
  assert.match(calls.dms[0], /refusée/);
  assert.match(JSON.stringify(calls.updates[0]), /contestation refusée/);
});

test("a contest already settled cannot be settled again", async () => {
  const { db, calls, run } = setupContest();
  await run("refuse", "u");
  await run("accept", "u", "WARN-1");
  assert.equal(countWarns(db), 1);
  assert.equal(getLog(db, REF).contestStatus, "refused");
  assert.match(calls.replies.at(-1).content, /déjà été traitée/);
});

test("a contest review respects the hierarchy", async () => {
  const message = contested().message;
  const strong = setup({
    message,
    target: fakeMember("u", ALL, 5),
  });
  insertWarning(strong.db);
  addLog(strong.db, { ...REF, userId: "u", date: 1_000 });
  markContested(strong.db, REF, 2_000);
  await strong.run("accept", "u", "WARN-1");
  assert.equal(countWarns(strong.db), 1);
  assert.match(strong.calls.replies[0].content, /Tu ne peux pas modérer/);
});

test("banning from a contest works like the other bans", async () => {
  const { calls, run } = setupContest();
  await run("ban", "u");
  assert.match(JSON.stringify(calls.replies[0]), /Bannir <@u>/);
});
