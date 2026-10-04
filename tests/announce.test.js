const test = require("node:test");
const assert = require("node:assert/strict");
const { formatAnnouncement, announceLevelUp } = require("../utils/announce");

function fakeChannel() {
  const sent = [];
  return {
    sent,
    isTextBased: () => true,
    send: async (content) => sent.push(content),
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
  const announce = () =>
    announceLevelUp({ settings, member, level: 3, channel: current });
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
