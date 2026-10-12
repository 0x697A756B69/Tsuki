const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { updateAutomodSettings } = require("../utils/automodSettings");
const { insertWarning, noteSanction } = require("../utils/warnSanctions");
const {
  FIRST_WINDOW,
  expiredMutes,
  sweepMutes,
} = require("../utils/muteSweep");

const NOW = 1_700_000_000_000;
const MINUTE = 60 * 1000;

function createDatabase({ muteRole = "mute" } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateAutomodSettings(db, "g", { muteRole }, "admin");
  return db;
}

function mute(db, id, user, until, sanction = "timeout") {
  insertWarning(db, {
    id,
    guildId: "g",
    userId: user,
    authorId: "mod",
    reason: "Spam",
    date: NOW - 60 * MINUTE,
  });
  noteSanction(db, id, sanction, until);
}

function createMember(calls, { hasRole = true, failing = false } = {}) {
  return {
    roles: {
      cache: new Map(hasRole ? [["mute", { id: "mute" }]] : []),
      remove: async (role, reason) => {
        if (failing) throw new Error("Missing Permissions");
        calls.push(["remove", role, reason]);
      },
    },
  };
}

function createBot(db, members = {}, calls = []) {
  const cache = new Map(
    Object.entries(members).map(([id, options]) => [
      id,
      createMember(calls, options),
    ]),
  );
  return {
    db,
    calls,
    guilds: {
      cache: new Map([
        ["g", { id: "g", members: { cache, fetch: async () => null } }],
      ]),
    },
  };
}

test("expiredMutes lists members whose mute ended since the last sweep", () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 5 * MINUTE);

  assert.deepEqual(expiredMutes(db, NOW - 10 * MINUTE, NOW), [
    { guild: "g", user: "a", role: "mute" },
  ]);
});

test("expiredMutes skips mutes that are still running", () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW + 5 * MINUTE);

  assert.deepEqual(expiredMutes(db, NOW - 10 * MINUTE, NOW), []);
});

test("expiredMutes skips mutes that ended before the last sweep", () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 20 * MINUTE);

  assert.deepEqual(expiredMutes(db, NOW - 10 * MINUTE, NOW), []);
});

test("expiredMutes skips a member who is muted again by a later warning", () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 5 * MINUTE);
  mute(db, "W2", "a", NOW + 30 * MINUTE);

  assert.deepEqual(expiredMutes(db, NOW - 10 * MINUTE, NOW), []);
});

test("expiredMutes lists a member only once", () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 8 * MINUTE);
  mute(db, "W2", "a", NOW - 5 * MINUTE);

  assert.equal(expiredMutes(db, NOW - 10 * MINUTE, NOW).length, 1);
});

test("expiredMutes ignores kicks, bans and servers without a mute role", () => {
  const db = createDatabase();
  mute(db, "W1", "a", null, "kick");
  mute(db, "W2", "b", NOW - 5 * MINUTE, "ban");
  const bare = createDatabase({ muteRole: null });
  mute(bare, "W3", "c", NOW - 5 * MINUTE);

  assert.deepEqual(expiredMutes(db, NOW - 10 * MINUTE, NOW), []);
  assert.deepEqual(expiredMutes(bare, NOW - 10 * MINUTE, NOW), []);
});

test("sweepMutes removes the mute role once the mute has ended", async () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 5 * MINUTE);
  const bot = createBot(db, { a: {} });

  assert.equal(await sweepMutes(bot, NOW), 1);
  assert.deepEqual(bot.calls, [
    ["remove", "mute", "Tsuki : fin de la sourdine"],
  ]);
});

test("sweepMutes looks back over the first window after a restart", async () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - FIRST_WINDOW + MINUTE);
  const bot = createBot(db, { a: {} });

  assert.equal(await sweepMutes(bot, NOW), 1);
});

test("sweepMutes does not look at the same period twice", async () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 5 * MINUTE);
  const bot = createBot(db, { a: {} });

  await sweepMutes(bot, NOW);
  assert.equal(await sweepMutes(bot, NOW + MINUTE), 0);
  assert.equal(bot.calls.length, 1);
});

test("sweepMutes leaves members who no longer have the role", async () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 5 * MINUTE);
  const bot = createBot(db, { a: { hasRole: false } });

  assert.equal(await sweepMutes(bot, NOW), 0);
  assert.deepEqual(bot.calls, []);
});

test("sweepMutes skips members who left the server", async () => {
  const db = createDatabase();
  mute(db, "W1", "gone", NOW - 5 * MINUTE);
  const bot = createBot(db);

  assert.equal(await sweepMutes(bot, NOW), 0);
});

test("sweepMutes tries again later when Discord refuses", async () => {
  const db = createDatabase();
  mute(db, "W1", "a", NOW - 5 * MINUTE);
  const bot = createBot(db, { a: { failing: true } });

  assert.equal(await sweepMutes(bot, NOW), 0);
  assert.equal(bot.muteSweptAt, undefined);

  bot.guilds.cache.get("g").members.cache.set("a", createMember(bot.calls));
  assert.equal(await sweepMutes(bot, NOW + MINUTE), 1);
  assert.equal(bot.muteSweptAt, NOW + MINUTE);
});
