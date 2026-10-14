const test = require("node:test");
const assert = require("node:assert/strict");
const { addMessage } = require("../../utils/xp/messageCount");
const { setModifier, getModifiers } = require("../../utils/xp/modifiers");
const {
  purgeChannel,
  findMissingChannels,
  sweepDeletedChannels,
} = require("../../utils/core/channelCleanup");
const channelDelete = require("../../events/channelDelete");
const { createDatabase } = require("../helpers/database");

function counted(db, guildId) {
  return db
    .prepare(
      "SELECT DISTINCT channel FROM message_daily WHERE guild = ? ORDER BY channel",
    )
    .all(guildId)
    .map((row) => String(row.channel));
}

function seed(db) {
  addMessage(db, "g", "gone", "u");
  addMessage(db, "g", "kept", "u");
  addMessage(db, "other", "gone", "u");
  setModifier(db, "g", "channel", "gone", 0);
  setModifier(db, "g", "channel", "kept", 1.5);
  setModifier(db, "g", "role", "gone", 1.5);
  setModifier(db, "other", "channel", "gone", 0);
}

test("purgeChannel removes the counts and the channel modifier of that channel", () => {
  const db = createDatabase();
  seed(db);
  purgeChannel(db, "g", "gone");
  assert.deepEqual(counted(db, "g"), ["kept"]);
  const modifiers = getModifiers(db, "g");
  assert.equal(modifiers.channel.has("gone"), false);
  assert.equal(modifiers.channel.get("kept"), 1.5);
});

test("purgeChannel keeps role modifiers and other guilds", () => {
  const db = createDatabase();
  seed(db);
  purgeChannel(db, "g", "gone");
  assert.equal(getModifiers(db, "g").role.get("gone"), 1.5);
  assert.deepEqual(counted(db, "other"), ["gone"]);
  assert.equal(getModifiers(db, "other").channel.get("gone"), 0);
});

test("purgeChannel does nothing for an unknown channel", () => {
  const db = createDatabase();
  seed(db);
  purgeChannel(db, "g", "nowhere");
  assert.deepEqual(counted(db, "g"), ["gone", "kept"]);
});

test("findMissingChannels lists the stored channels that no longer exist", () => {
  const db = createDatabase();
  seed(db);
  addMessage(db, "g", "lost", "u");
  setModifier(db, "g", "channel", "ghost", 0);
  const missing = findMissingChannels(db, "g", new Set(["kept"]));
  assert.deepEqual(missing.sort(), ["ghost", "gone", "lost"]);
});

test("findMissingChannels is empty when every channel exists", () => {
  const db = createDatabase();
  seed(db);
  assert.deepEqual(findMissingChannels(db, "g", new Set(["gone", "kept"])), []);
});

test("the channelDelete event purges the deleted channel", async () => {
  const db = createDatabase();
  seed(db);
  await channelDelete({ db }, { guildId: "g", id: "gone" });
  assert.deepEqual(counted(db, "g"), ["kept"]);
  assert.equal(getModifiers(db, "g").channel.has("gone"), false);
});

test("the channelDelete event ignores a channel outside a guild", async () => {
  const db = createDatabase();
  seed(db);
  await channelDelete({ db }, { guildId: null, id: "gone" });
  assert.deepEqual(counted(db, "g"), ["gone", "kept"]);
});

test("the startup sweep purges channels missing from each guild", async () => {
  const db = createDatabase();
  seed(db);
  const guild = {
    id: "g",
    channels: { fetch: async () => new Map([["kept", {}]]) },
  };
  await sweepDeletedChannels({
    db,
    guilds: { cache: new Map([["g", guild]]) },
  });
  assert.deepEqual(counted(db, "g"), ["kept"]);
  assert.deepEqual(counted(db, "other"), ["gone"]);
});

test("the startup sweep keeps everything when a guild cannot be fetched", async () => {
  const db = createDatabase();
  seed(db);
  const guild = {
    id: "g",
    channels: {
      fetch: async () => {
        throw new Error("unavailable");
      },
    },
  };
  await sweepDeletedChannels({
    db,
    guilds: { cache: new Map([["g", guild]]) },
  });
  assert.deepEqual(counted(db, "g"), ["gone", "kept"]);
});
