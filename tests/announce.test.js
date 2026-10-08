const test = require("node:test");
const assert = require("node:assert/strict");
const { formatAnnouncement, announceLevelUp } = require("../utils/announce");

function fakeChannel() {
  const sent = [];
  const payloads = [];
  return {
    sent,
    payloads,
    isTextBased: () => true,
    send: async (payload) => {
      payloads.push(payload);
      sent.push(payload.content);
    },
  };
}

function setup(announceMode, announceChannel = null) {
  const current = fakeChannel();
  const dedicated = fakeChannel();
  const dms = fakeChannel();
  const member = {
    toString: () => "<@1>",
    send: dms.send,
    guild: { channels: { cache: new Map([["42", dedicated]]) } },
  };
  const settings = {
    announceMode,
    announceChannel,
    announceMessage: "{membre} -> {niveau}",
  };
  const announce = (role = null) =>
    announceLevelUp({ settings, member, level: 3, channel: current, role });
  announce.settings = settings;
  return { current, dedicated, dms, announce };
}

test("formatAnnouncement replaces every placeholder", () => {
  assert.equal(
    formatAnnouncement("GG {membre} ! Niveau {niveau}, {membre} !", {
      member: "<@1>",
      level: 7,
    }),
    "GG <@1> ! Niveau 7, <@1> !",
  );
});

test("announces in the current channel", async () => {
  const { current, announce } = setup("current");
  await announce();
  assert.deepEqual(current.sent, ["<@1> -> 3"]);
});

test("announces in the dedicated channel", async () => {
  const { current, dedicated, announce } = setup("channel", "42");
  await announce();
  assert.deepEqual(dedicated.sent, ["<@1> -> 3"]);
  assert.deepEqual(current.sent, []);
});

test("falls back to the current channel when the dedicated one is gone", async () => {
  const { current, announce } = setup("channel", "999");
  await announce();
  assert.deepEqual(current.sent, ["<@1> -> 3"]);
});

test("announces in private messages", async () => {
  const { dms, announce } = setup("dm");
  await announce();
  assert.deepEqual(dms.sent, ["<@1> -> 3"]);
});

test("stays silent when announcements are off", async () => {
  const { current, dedicated, dms, announce } = setup("off");
  await announce();
  assert.deepEqual([...current.sent, ...dedicated.sent, ...dms.sent], []);
});

test("formatAnnouncement replaces {role} with a role mention", () => {
  assert.equal(
    formatAnnouncement("{membre} reçoit {role} !", {
      member: "<@1>",
      level: 7,
      role: "regular",
    }),
    "<@1> reçoit <@&regular> !",
  );
});

test("formatAnnouncement removes {role} cleanly when no role was gained", () => {
  assert.equal(
    formatAnnouncement("GG {membre}, tu reçois {role} !", {
      member: "<@1>",
      level: 7,
    }),
    "GG <@1>, tu reçois !",
  );
  assert.equal(
    formatAnnouncement("Niveau {niveau} {role}", { member: "<@1>", level: 7 }),
    "Niveau 7",
  );
});

test("announces the role gained", async () => {
  const { current, announce } = setup("current");
  announce.settings.announceMessage = "{membre} -> {role}";
  await announce("regular");
  assert.deepEqual(current.sent, ["<@1> -> <@&regular>"]);
});

test("announcements never ping roles", async () => {
  const { current, announce } = setup("current");
  await announce("regular");
  assert.deepEqual(current.payloads[0].allowedMentions, { parse: ["users"] });
});
