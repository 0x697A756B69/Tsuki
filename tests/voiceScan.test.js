const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { scanVoice } = require("../utils/voiceScan");
const { updateSettings } = require("../utils/settings");
const { setModifier } = require("../utils/modifiers");
const { setReward } = require("../utils/rewards");
const { addXp } = require("../utils/xp");

const granted = [];
const announced = [];
const direct = [];

function createBot(settings = {}) {
  granted.length = 0;
  announced.length = 0;
  direct.length = 0;
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateSettings(db, "g", { announceMode: "off", ...settings }, "admin");
  return { db, guilds: { cache: new Map() } };
}

function voiceMember(
  id,
  { roles = [], bot = false, selfMute = false, selfDeaf = false } = {},
) {
  return {
    id,
    user: { bot },
    voice: { selfMute, selfDeaf },
    roles: {
      cache: new Map(roles.map((role) => [role, {}])),
      add: async (role) => granted.push(role),
      remove: async () => {},
    },
    send: async (payload) => direct.push(payload.content),
    toString: () => `<@${id}>`,
  };
}

function addGuild(bot, channels, afkChannelId = null) {
  const guild = {
    id: "g",
    afkChannelId,
    roles: { cache: new Map([["regular", {}]]) },
    channels: { cache: new Map() },
  };
  guild.channels.cache.set("text", {
    id: "text",
    isVoiceBased: () => Boolean(0),
    isTextBased: () => Boolean(1),
    send: async (payload) => announced.push(payload.content),
  });

  for (const [id, members] of Object.entries(channels)) {
    for (const member of members) member.guild = guild;
    guild.channels.cache.set(id, {
      id,
      isVoiceBased: () => Boolean(1),
      isTextBased: () => Boolean(0),
      send: async () => {},
      members: new Map(members.map((member) => [member.id, member])),
    });
  }
  bot.guilds.cache.set("g", guild);
}

function xpOf(bot, user) {
  const row = bot.db
    .prepare("SELECT total_xp FROM members WHERE user = ?")
    .get(user);
  return row ? Number(row.total_xp) : 0;
}

test("members with company in a voice channel earn the voice XP", async () => {
  const bot = createBot({ voiceXp: 10 });
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.equal(xpOf(bot, "a"), 10);
  assert.equal(xpOf(bot, "b"), 10);
});

test("members alone, muted or deafened earn nothing", async () => {
  const bot = createBot();
  addGuild(bot, {
    alone: [voiceMember("loner")],
    duo: [
      voiceMember("muted", { selfMute: true }),
      voiceMember("deaf", { selfDeaf: true }),
      voiceMember("talker"),
    ],
  });

  await scanVoice(bot);

  assert.equal(xpOf(bot, "loner"), 0);
  assert.equal(xpOf(bot, "muted"), 0);
  assert.equal(xpOf(bot, "deaf"), 0);
  assert.equal(xpOf(bot, "talker"), 10);
});

test("the AFK channel and bots earn nothing", async () => {
  const bot = createBot();
  addGuild(
    bot,
    {
      afk: [voiceMember("a"), voiceMember("b")],
      v: [
        voiceMember("c"),
        voiceMember("d"),
        voiceMember("bot", { bot: true }),
      ],
    },
    "afk",
  );

  await scanVoice(bot);

  assert.equal(xpOf(bot, "a"), 0);
  assert.equal(xpOf(bot, "bot"), 0);
  assert.equal(xpOf(bot, "c"), 10);
});

test("nothing happens when voice XP is disabled or set to zero", async () => {
  const bot = createBot({ voiceEnabled: false });
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });
  await scanVoice(bot);
  assert.equal(xpOf(bot, "a"), 0);

  updateSettings(bot.db, "g", { voiceEnabled: true, voiceXp: 0 }, "admin");
  await scanVoice(bot);
  assert.equal(xpOf(bot, "a"), 0);
});

test("channel and role bonuses apply, an exclusion wins", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "channel", "boosted", 2);
  setModifier(bot.db, "g", "role", "booster", 1.5);
  setModifier(bot.db, "g", "role", "muted", 0);
  addGuild(bot, {
    boosted: [voiceMember("a"), voiceMember("b", { roles: ["booster"] })],
    plain: [
      voiceMember("c", { roles: ["booster"] }),
      voiceMember("d", { roles: ["muted"] }),
    ],
  });

  await scanVoice(bot);

  assert.equal(xpOf(bot, "a"), 20);
  assert.equal(xpOf(bot, "b"), 30);
  assert.equal(xpOf(bot, "c"), 15);
  assert.equal(xpOf(bot, "d"), 0);
});

test("reaching a level with a reward gives the role", async () => {
  const bot = createBot();
  setReward(bot.db, "g", 1, "regular");
  addXp(bot.db, "g", "a", 95);
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.deepEqual(granted, ["regular"]);
});

test("the level up is announced in the configured channel", async () => {
  const bot = createBot({
    announceMode: "channel",
    announceChannel: "text",
    announceMessage: "{niveau} {role}",
  });
  setReward(bot.db, "g", 1, "regular");
  addXp(bot.db, "g", "a", 95);
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.deepEqual(announced, ["1 <@&regular>"]);
});

test("the level up is sent by DM in DM mode", async () => {
  const bot = createBot({ announceMode: "dm", announceMessage: "{niveau}" });
  addXp(bot.db, "g", "a", 95);
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.deepEqual(direct, ["1"]);
});

test("the level up is not announced in current channel mode", async () => {
  const bot = createBot({ announceMode: "current" });
  addXp(bot.db, "g", "a", 95);
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.deepEqual(announced, []);
  assert.equal(xpOf(bot, "a"), 105);
});

test("a failing member does not stop the scan", async () => {
  const bot = createBot();
  const broken = voiceMember("broken");
  broken.roles = null;
  addGuild(bot, { v: [broken, voiceMember("a"), voiceMember("b")] });
  const log = console.error;
  console.error = () => {};

  try {
    await scanVoice(bot);
  } finally {
    console.error = log;
  }

  assert.equal(xpOf(bot, "a"), 10);
  assert.equal(xpOf(bot, "b"), 10);
});

function minutesOf(bot, user) {
  const row = bot.db
    .prepare(
      "SELECT COALESCE(SUM(minutes), 0) AS minutes FROM voice_daily WHERE user = ?",
    )
    .get(user);
  return Number(row.minutes);
}

test("each scan counts one voice minute for eligible members", async () => {
  const bot = createBot();
  addGuild(bot, {
    v: [voiceMember("a"), voiceMember("b")],
    alone: [voiceMember("loner")],
  });

  await scanVoice(bot);
  await scanVoice(bot);

  assert.equal(minutesOf(bot, "a"), 2);
  assert.equal(minutesOf(bot, "b"), 2);
  assert.equal(minutesOf(bot, "loner"), 0);
});

test("voice minutes are counted even when the voice XP is zero", async () => {
  const bot = createBot({ voiceXp: 0 });
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.equal(xpOf(bot, "a"), 0);
  assert.equal(minutesOf(bot, "a"), 1);
});

test("voice minutes are not counted when voice is disabled", async () => {
  const bot = createBot({ voiceEnabled: false });
  addGuild(bot, { v: [voiceMember("a"), voiceMember("b")] });

  await scanVoice(bot);

  assert.equal(minutesOf(bot, "a"), 0);
});

test("excluded channels and roles are not counted", async () => {
  const bot = createBot();
  setModifier(bot.db, "g", "channel", "quiet", 0);
  setModifier(bot.db, "g", "role", "muted", 0);
  addGuild(bot, {
    quiet: [voiceMember("a"), voiceMember("b")],
    plain: [voiceMember("c"), voiceMember("d", { roles: ["muted"] })],
  });

  await scanVoice(bot);

  assert.equal(minutesOf(bot, "a"), 0);
  assert.equal(minutesOf(bot, "c"), 1);
  assert.equal(minutesOf(bot, "d"), 0);
});
