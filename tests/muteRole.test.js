const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");
const {
  MUTE_DENIED,
  denyMuteRole,
  ensureMuteRole,
} = require("../utils/muteRole");
const channelCreate = require("../events/channelCreate");

function createChannel(id, { existing = [], failing = false } = {}) {
  const edits = [];
  return {
    id,
    guildId: "g",
    edits,
    permissionOverwrites: {
      cache: new Map(existing.map((role) => [role, { id: role }])),
      edit: async (role, permissions) => {
        if (failing) throw new Error("Missing Permissions");
        edits.push([role, permissions]);
      },
    },
  };
}

function createFixture({ roleExists = false, channels = [] } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  const roles = new Map(roleExists ? [["mute", { id: "mute" }]] : []);
  const created = [];
  const guild = {
    id: "g",
    roles: {
      cache: roles,
      create: async (options) => {
        created.push(options);
        const role = { id: "new" };
        roles.set("new", role);
        return role;
      },
    },
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
  };
  return { db, guild, created };
}

test("MUTE_DENIED refuses writing, reacting, speaking and creating threads", () => {
  assert.deepEqual(Object.keys(MUTE_DENIED).sort(), [
    "AddReactions",
    "CreatePrivateThreads",
    "CreatePublicThreads",
    "SendMessages",
    "SendMessagesInThreads",
    "Speak",
  ]);
  assert.ok(Object.values(MUTE_DENIED).every((value) => value === false));
});

test("denyMuteRole refuses the permissions on the channel", async () => {
  const channel = createChannel("c1");

  assert.equal(await denyMuteRole(channel, "mute"), true);
  assert.deepEqual(channel.edits, [["mute", MUTE_DENIED]]);
});

test("denyMuteRole leaves a channel that already has a rule for the role", async () => {
  const channel = createChannel("c1", { existing: ["mute"] });

  assert.equal(await denyMuteRole(channel, "mute"), false);
  assert.deepEqual(channel.edits, []);
});

test("denyMuteRole reports a refusal without throwing", async () => {
  assert.equal(
    await denyMuteRole(createChannel("c1", { failing: true }), "mute"),
    false,
  );
});

test("denyMuteRole ignores channels without permission overwrites", async () => {
  assert.equal(await denyMuteRole({ id: "t1" }, "mute"), false);
});

test("ensureMuteRole creates the role and denies it on every channel", async () => {
  const c1 = createChannel("c1");
  const c2 = createChannel("c2");
  const { db, guild, created } = createFixture({ channels: [c1, c2] });

  const id = await ensureMuteRole(db, guild, getAutomodSettings(db, "g"));

  assert.equal(id, "new");
  assert.equal(created.length, 1);
  assert.equal(created[0].name, "Muet");
  assert.deepEqual(created[0].permissions, []);
  assert.equal(c1.edits.length, 1);
  assert.equal(c2.edits.length, 1);
  assert.equal(getAutomodSettings(db, "g").muteRole, "new");
});

test("ensureMuteRole reuses the saved role while it still exists", async () => {
  const { db, guild, created } = createFixture({ roleExists: true });
  updateAutomodSettings(db, "g", { muteRole: "mute" }, "admin");

  const id = await ensureMuteRole(db, guild, getAutomodSettings(db, "g"));

  assert.equal(id, "mute");
  assert.equal(created.length, 0);
});

test("ensureMuteRole creates a new role when the saved one was deleted", async () => {
  const { db, guild, created } = createFixture();
  updateAutomodSettings(db, "g", { muteRole: "gone" }, "admin");

  const id = await ensureMuteRole(db, guild, getAutomodSettings(db, "g"));

  assert.equal(id, "new");
  assert.equal(created.length, 1);
  assert.equal(getAutomodSettings(db, "g").muteRole, "new");
});

test("ensureMuteRole returns null when the role cannot be created", async () => {
  const { db, guild } = createFixture();
  guild.roles.create = async () => {
    throw new Error("Missing Permissions");
  };

  assert.equal(
    await ensureMuteRole(db, guild, getAutomodSettings(db, "g")),
    null,
  );
  assert.equal(getAutomodSettings(db, "g").muteRole, null);
});

test("channelCreate denies the mute role on a new channel", async () => {
  const { db } = createFixture();
  updateAutomodSettings(db, "g", { muteRole: "mute" }, "admin");
  const channel = createChannel("new-channel");

  await channelCreate({ db }, channel);

  assert.deepEqual(channel.edits, [["mute", MUTE_DENIED]]);
});

test("channelCreate does nothing without a mute role", async () => {
  const { db } = createFixture();
  const channel = createChannel("new-channel");

  await channelCreate({ db }, channel);

  assert.deepEqual(channel.edits, []);
});

test("channelCreate ignores channels outside a server", async () => {
  const { db } = createFixture();
  const channel = { ...createChannel("dm"), guildId: null };

  await channelCreate({ db }, channel);

  assert.deepEqual(channel.edits, []);
});

test(
  "two simultaneous ensureMuteRole create a single role",
  { todo: true },
  async () => {
    const { db, guild, created } = createFixture();
    const settings = getAutomodSettings(db, "g");
    const [first, second] = await Promise.all([
      ensureMuteRole(db, guild, settings),
      ensureMuteRole(db, guild, settings),
    ]);

    assert.equal(created.length, 1);
    assert.equal(first, "new");
    assert.equal(second, "new");
  },
);

test(
  "a crash after the creation does not lose the role",
  { todo: true },
  async () => {
    const broken = createChannel("c1");
    broken.permissionOverwrites.edit = () => {
      throw new Error("crash");
    };
    const { db, guild } = createFixture({ channels: [broken] });
    await ensureMuteRole(db, guild, getAutomodSettings(db, "g")).catch(
      () => null,
    );

    assert.equal(getAutomodSettings(db, "g").muteRole, "new");
  },
);
