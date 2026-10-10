const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ordinal,
  describeFuture,
  warnLines,
  warnNotice,
  sendNotice,
  closedNotice,
  announceClosedDm,
} = require("../utils/moderationNotice");

const TIMEOUT_NEXT = { warns: 3, sanction: "timeout", minutes: 60 };

test("ordinal writes the rank of the warning", () => {
  assert.equal(ordinal(1), "1er");
  assert.equal(ordinal(2), "2e");
  assert.equal(ordinal(10), "10e");
});

test("describeFuture says what the member will become", () => {
  assert.equal(describeFuture(TIMEOUT_NEXT), "en sourdine de 1 h");
  assert.equal(
    describeFuture({ warns: 4, sanction: "kick", minutes: null }),
    "expulsé",
  );
  assert.equal(
    describeFuture({ warns: 5, sanction: "ban", minutes: null }),
    "banni",
  );
});

test("warnLines gives one short fact per line", () => {
  assert.deepEqual(warnLines({ count: 2, next: TIMEOUT_NEXT, validDays: 30 }), [
    "C'est ton 2e avertissement actif.",
    "Au 3e avertissement, tu seras en sourdine de 1 h.",
    "Celui-ci expire dans 30 jours.",
  ]);
});

test("warnLines skips the next step when there is none", () => {
  assert.deepEqual(warnLines({ count: 4, next: null, validDays: 30 }), [
    "C'est ton 4e avertissement actif.",
    "Celui-ci expire dans 30 jours.",
  ]);
});

test("warnLines skips the expiry when warnings never expire", () => {
  assert.deepEqual(warnLines({ count: 1, next: null, validDays: 0 }), [
    "C'est ton 1er avertissement actif.",
  ]);
});

test("warnLines uses the singular for one day", () => {
  assert.match(
    warnLines({ count: 1, next: null, validDays: 1 }).at(-1),
    /dans 1 jour\.$/,
  );
});

test("warnNotice shows the reason and the sanction as short fields", () => {
  const embed = warnNotice({
    guildName: "Serveur",
    reason: "Spam",
    count: 2,
    step: { warns: 2, sanction: "timeout", minutes: 10 },
    next: TIMEOUT_NEXT,
    validDays: 30,
    until: 120_000,
  }).embeds[0].toJSON();
  assert.equal(embed.title, "Avertissement sur Serveur");
  assert.deepEqual(
    embed.fields.map((field) => [field.name, field.value]),
    [
      ["Raison", "Spam"],
      ["Sanction", "Sourdine de 10 min"],
      ["Fin", "<t:120:f>"],
    ],
  );
  assert.equal(
    embed.fields.every((field) => field.inline),
    true,
  );
  assert.equal(embed.description.split("\n").length, 3);
});

test("warnNotice has no end field without a timeout", () => {
  const embed = warnNotice({
    guildName: "Serveur",
    reason: "Spam",
    count: 1,
    step: null,
    next: null,
    validDays: 0,
  }).embeds[0].toJSON();
  assert.deepEqual(
    embed.fields.map((field) => [field.name, field.value]),
    [
      ["Raison", "Spam"],
      ["Sanction", "Aucune sanction"],
    ],
  );
});

test("sendNotice tells whether the message arrived", async () => {
  assert.equal(await sendNotice({ send: async () => {} }, {}), true);
  assert.equal(
    await sendNotice(
      {
        send: async () => {
          throw new Error("closed");
        },
      },
      {},
    ),
    false,
  );
  assert.equal(await sendNotice(null, {}), false);
});

test("closedNotice names the member", () => {
  assert.match(closedNotice("u"), /^⚠️ <@u> a reçu un avertissement/);
});

test("announceClosedDm posts silently then deletes after the delay", async () => {
  const events = [];
  const channel = {
    send: async (payload) => {
      events.push(["send", payload]);
      return { delete: async () => events.push(["delete"]) };
    },
  };
  assert.equal(await announceClosedDm(channel, "u", 1), true);
  assert.equal(events[0][1].content, closedNotice("u"));
  assert.deepEqual(events[0][1].allowedMentions, { parse: [] });
  assert.deepEqual(events[1], ["delete"]);
});

test("announceClosedDm does nothing without a channel", async () => {
  assert.equal(await announceClosedDm(undefined, "u", 1), false);
  const broken = {
    send: async () => {
      throw new Error("no access");
    },
  };
  assert.equal(await announceClosedDm(broken, "u", 1), false);
});
