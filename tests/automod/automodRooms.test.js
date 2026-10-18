const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addLog,
  getLog,
  setContestChannel,
  setJudged,
} = require("../../utils/automod/automodLogs");
const {
  ROOM_LIFETIME,
  HOUR,
  ROOM_EXTENSION,
  getExpiredRooms,
  getRoomsToRemind,
  markReminded,
  extendRoom,
  getMemberRooms,
  closeRoom,
  sweepRooms,
  remindRooms,
  closeMemberRooms,
} = require("../../utils/automod/automodRooms");
const guildMemberRemove = require("../../events/guildMemberRemove");
const {
  updateAutomodSettings,
} = require("../../utils/automod/automodSettings");
const { createDatabase } = require("../helpers/database");

const NOW = 100 * ROOM_LIFETIME;

function room(
  db,
  messageId,
  { userId = "u", judgedAt = null, guildId = "g" } = {},
) {
  const ref = { guildId, channelId: "logs", messageId };
  addLog(db, { ...ref, userId, date: 1 });
  setContestChannel(db, ref, `room-${messageId}`);
  if (judgedAt !== null) setJudged(db, ref, "mod", judgedAt);
  return ref;
}

function fakeBot(db, { missing = [] } = {}) {
  const deleted = [];
  const sent = [];
  const channels = {
    fetch: async (id) => {
      if (missing.includes(id)) throw new Error("gone");
      return {
        id,
        name: id,
        delete: async (reason) => deleted.push({ id, reason }),
        send: async (message) => sent.push({ id, message }),
      };
    },
  };
  return {
    db,
    deleted,
    sent,
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

test("getRoomsToRemind returns rooms within the last hour before expiry", () => {
  const db = createDatabase();
  room(db, "soon", { judgedAt: NOW - ROOM_LIFETIME + HOUR });
  room(db, "late", { judgedAt: NOW - ROOM_LIFETIME + 1 });
  room(db, "far", { judgedAt: NOW - ROOM_LIFETIME + HOUR + 1 });
  room(db, "expired", { judgedAt: NOW - ROOM_LIFETIME });
  room(db, "open");
  assert.deepEqual(
    getRoomsToRemind(db, NOW)
      .map((entry) => entry.contestChannel)
      .sort(),
    ["room-late", "room-soon"],
  );
});

test("getRoomsToRemind follows the reminder delay of the guild", () => {
  const db = createDatabase();
  updateAutomodSettings(db, "g", { reminderHours: 6 }, "admin");
  room(db, "in", { judgedAt: NOW - ROOM_LIFETIME + 6 * HOUR });
  room(db, "out", { judgedAt: NOW - ROOM_LIFETIME + 6 * HOUR + 1 });
  assert.deepEqual(
    getRoomsToRemind(db, NOW).map((entry) => entry.contestChannel),
    ["room-in"],
  );
});

test("getRoomsToRemind skips guilds that turned the reminder off", () => {
  const db = createDatabase();
  updateAutomodSettings(db, "off", { reminderHours: 0 }, "admin");
  room(db, "a", { guildId: "off", judgedAt: NOW - ROOM_LIFETIME + 1 });
  room(db, "b", { guildId: "on", judgedAt: NOW - ROOM_LIFETIME + 1 });
  assert.deepEqual(
    getRoomsToRemind(db, NOW).map((entry) => entry.ref.guildId),
    ["on"],
  );
});

test("markReminded stops a room from being reminded twice", () => {
  const db = createDatabase();
  const ref = room(db, "a", { judgedAt: NOW - ROOM_LIFETIME + 1 });
  markReminded(db, ref);
  assert.equal(getRoomsToRemind(db, NOW).length, 0);
});

test("extendRoom delays expiry and allows a new reminder", () => {
  const db = createDatabase();
  const ref = room(db, "a", { judgedAt: NOW - ROOM_LIFETIME + 1 });
  markReminded(db, ref);
  extendRoom(db, ref);
  assert.equal(getExpiredRooms(db, NOW + ROOM_LIFETIME - 2).length, 0);
  assert.equal(getExpiredRooms(db, NOW + ROOM_LIFETIME + 1).length, 1);
  assert.equal(getRoomsToRemind(db, NOW).length, 0);
  assert.equal(getRoomsToRemind(db, NOW + ROOM_EXTENSION).length, 1);
});

test("remindRooms warns each room once, an hour before its deletion", async () => {
  const db = createDatabase();
  room(db, "soon", { judgedAt: NOW - ROOM_LIFETIME + 1 });
  room(db, "far", { judgedAt: NOW });
  const bot = fakeBot(db);
  assert.equal(await remindRooms(bot, NOW), 1);
  assert.deepEqual(
    bot.sent.map((entry) => entry.id),
    ["room-soon"],
  );
  assert.match(bot.sent[0].message.content, /supprimé/);
  assert.equal(await remindRooms(bot, NOW), 0);
  assert.equal(bot.sent.length, 1);
});

test("remindRooms survives a room that is already gone", async () => {
  const db = createDatabase();
  room(db, "soon", { judgedAt: NOW - ROOM_LIFETIME + 1 });
  const bot = fakeBot(db, { missing: ["room-soon"] });
  assert.equal(await remindRooms(bot, NOW), 1);
  assert.equal(bot.sent.length, 0);
});
