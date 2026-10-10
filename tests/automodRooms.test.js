const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  addLog,
  getLog,
  setContestChannel,
  setJudged,
} = require("../utils/automodLogs");
const {
  ROOM_LIFETIME,
  getExpiredRooms,
  getMemberRooms,
  closeRoom,
  sweepRooms,
  closeMemberRooms,
} = require("../utils/automodRooms");
const guildMemberRemove = require("../events/guildMemberRemove");

const NOW = 100 * ROOM_LIFETIME;

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function room(db, messageId, { userId = "u", judgedAt = null } = {}) {
  const ref = { guildId: "g", channelId: "logs", messageId };
  addLog(db, { ...ref, userId, date: 1 });
  setContestChannel(db, ref, `room-${messageId}`);
  if (judgedAt !== null) setJudged(db, ref, "mod", judgedAt);
  return ref;
}

function fakeBot(db, { missing = [] } = {}) {
  const deleted = [];
  const channels = {
    fetch: async (id) => {
      if (missing.includes(id)) throw new Error("gone");
      return {
        id,
        name: id,
        delete: async (reason) => deleted.push({ id, reason }),
      };
    },
  };
  return {
    db,
    deleted,
    guilds: { fetch: async () => ({ id: "g", channels }) },
  };
}

test("getExpiredRooms returns judged rooms older than 24 hours", () => {
  const db = createDatabase();
  room(db, "old", { judgedAt: NOW - ROOM_LIFETIME - 1 });
  room(db, "edge", { judgedAt: NOW - ROOM_LIFETIME });
  room(db, "fresh", { judgedAt: NOW - ROOM_LIFETIME + 1 });
  room(db, "open");
  assert.deepEqual(
    getExpiredRooms(db, NOW)
      .map((entry) => entry.contestChannel)
      .sort(),
    ["room-edge", "room-old"],
  );
});

test("getExpiredRooms carries the log reference and honours the limit", () => {
  const db = createDatabase();
  for (const id of ["a", "b", "c"]) room(db, id, { judgedAt: 1 });
  assert.equal(getExpiredRooms(db, NOW, 2).length, 2);
  assert.deepEqual(getExpiredRooms(db, NOW, 1)[0].ref, {
    guildId: "g",
    channelId: "logs",
    messageId: "a",
  });
});

test("getMemberRooms finds the open rooms of one member", () => {
  const db = createDatabase();
  room(db, "mine", { userId: "u" });
  room(db, "other", { userId: "v" });
  addLog(db, {
    guildId: "g",
    channelId: "logs",
    messageId: "plain",
    userId: "u",
    date: 1,
  });
  assert.deepEqual(
    getMemberRooms(db, "g", "u").map((entry) => entry.contestChannel),
    ["room-mine"],
  );
  assert.deepEqual(getMemberRooms(db, "other-guild", "u"), []);
});

test("closeRoom forgets the room and deletes the channel", async () => {
  const db = createDatabase();
  const ref = room(db, "m");
  const bot = fakeBot(db);
  const closed = await closeRoom(
    bot,
    { ref, contestChannel: "room-m" },
    "raison",
  );
  assert.equal(closed, true);
  assert.equal(getLog(db, ref).contestChannel, null);
  assert.deepEqual(bot.deleted, [{ id: "room-m", reason: "raison" }]);
});

test("closeRoom still forgets a channel that is already gone", async () => {
  const db = createDatabase();
  const ref = room(db, "m");
  const bot = fakeBot(db, { missing: ["room-m"] });
  const closed = await closeRoom(bot, { ref, contestChannel: "room-m" }, "r");
  assert.equal(closed, false);
  assert.equal(getLog(db, ref).contestChannel, null);
  assert.equal(bot.deleted.length, 0);
});

test("sweepRooms closes only the expired rooms", async () => {
  const db = createDatabase();
  room(db, "old", { judgedAt: 1 });
  room(db, "open");
  const bot = fakeBot(db);
  assert.equal(await sweepRooms(bot, NOW), 1);
  assert.deepEqual(
    bot.deleted.map((entry) => entry.id),
    ["room-old"],
  );
  assert.equal(await sweepRooms(bot, NOW), 0);
});

test("closeMemberRooms closes the rooms of the member who left", async () => {
  const db = createDatabase();
  room(db, "mine", { userId: "u" });
  room(db, "other", { userId: "v" });
  const bot = fakeBot(db);
  assert.equal(await closeMemberRooms(bot, "g", "u"), 1);
  assert.deepEqual(
    bot.deleted.map((entry) => entry.id),
    ["room-mine"],
  );
});

test("guildMemberRemove closes the room of a leaving member", async () => {
  const db = createDatabase();
  room(db, "mine", { userId: "u" });
  const bot = fakeBot(db);
  await guildMemberRemove(bot, { id: "u", guild: { id: "g" } });
  assert.deepEqual(
    bot.deleted.map((entry) => entry.id),
    ["room-mine"],
  );
});