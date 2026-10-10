const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ordinal,
  describeFuture,
  warnLines,
  warnNotice,
  closedDmLine,
  banNotice,
  kickNotice,
  timeoutNotice,
  untimeoutNotice,
  verdictNotice,
  COLORS,
  sendNotice,
  closedNotice,
  announceClosedDm,
  CLOSED_DELETE_DELAY,
  CONTEST_DELETE_DELAY,
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

test("closedNotice points to the contest button when there is one", () => {
  assert.equal(closedNotice("u", false), closedNotice("u"));
  assert.match(closedNotice("u", true), /contester avec le bouton ci-dessous/);
});

test("announceClosedDm carries the contest buttons it is given", async () => {
  const row = { type: 1, components: [] };
  const sent = [];
  const channel = {
    send: async (payload) => {
      sent.push(payload);
      return { delete: async () => {} };
    },
  };
  assert.equal(await announceClosedDm(channel, "u", 1, [row]), true);
  assert.deepEqual(sent[0].components, [row]);
  assert.equal(sent[0].content, closedNotice("u", true));
});

test("announceClosedDm keeps the contest notice longer", () => {
  assert.equal(CLOSED_DELETE_DELAY, 8000);
  assert.ok(CONTEST_DELETE_DELAY >= 60 * 1000);
});

const BASE = { guildName: "Serveur", reason: "Spam", moderator: "Izuki" };

function pairs(embed) {
  return embed.fields.map((field) => [field.name, field.value]);
}

test("banNotice is red and names the reason and the moderator", () => {
  const embed = banNotice(BASE).embeds[0].toJSON();
  assert.equal(embed.title, "Bannissement de Serveur");
  assert.equal(embed.color, COLORS.ban);
  assert.deepEqual(pairs(embed), [
    ["Raison", "Spam"],
    ["Modérateur", "Izuki"],
  ]);
  assert.equal(embed.description, "Tu ne peux plus rejoindre ce serveur.");
  assert.equal(embed.footer.text, "Serveur");
});

test("kickNotice is darker orange than a timeout", () => {
  const embed = kickNotice(BASE).embeds[0].toJSON();
  assert.equal(embed.title, "Expulsion de Serveur");
  assert.equal(embed.color, COLORS.kick);
  assert.notEqual(COLORS.kick, COLORS.timeout);
  assert.equal(
    embed.description,
    "Tu peux revenir avec une nouvelle invitation.",
  );
});

test("timeoutNotice puts the end between the reason and the moderator", () => {
  const embed = timeoutNotice({ ...BASE, until: 120_000 }).embeds[0].toJSON();
  assert.equal(embed.title, "Sourdine sur Serveur");
  assert.equal(embed.color, COLORS.timeout);
  assert.deepEqual(pairs(embed), [
    ["Raison", "Spam"],
    ["Fin", "<t:120:f>"],
    ["Modérateur", "Izuki"],
  ]);
  assert.equal(
    embed.fields.every((field) => field.inline),
    true,
  );
});

test("untimeoutNotice is green", () => {
  const embed = untimeoutNotice(BASE).embeds[0].toJSON();
  assert.equal(embed.title, "Sourdine levée sur Serveur");
  assert.equal(embed.color, COLORS.lifted);
  assert.equal(embed.description, "Tu peux de nouveau écrire et parler.");
});

test("verdictNotice accepted lists what was lifted, one per line", () => {
  const plain = verdictNotice({ guildName: "Serveur", accepted: true });
  assert.equal(
    plain.embeds[0].toJSON().title,
    "Contestation acceptée sur Serveur",
  );
  assert.equal(plain.embeds[0].toJSON().color, COLORS.accepted);
  assert.equal(
    plain.embeds[0].toJSON().description,
    "Ton avertissement est retiré.",
  );
  const timeout = verdictNotice({
    guildName: "Serveur",
    accepted: true,
    lifted: "timeout",
  });
  assert.equal(
    timeout.embeds[0].toJSON().description,
    "Ton avertissement est retiré.\nTa sourdine est levée.",
  );
  const ban = verdictNotice({
    guildName: "Serveur",
    accepted: true,
    lifted: "ban",
  });
  assert.match(
    ban.embeds[0].toJSON().description,
    /\nTon bannissement est levé.$/,
  );
});

test("verdictNotice refused is gray and keeps the warning", () => {
  const embed = verdictNotice({
    guildName: "Serveur",
    accepted: false,
    lifted: "timeout",
  }).embeds[0].toJSON();
  assert.equal(embed.title, "Contestation refusée sur Serveur");
  assert.equal(embed.color, COLORS.refused);
  assert.equal(embed.description, "L'avertissement est maintenu.");
  assert.equal((embed.fields ?? []).length, 0);
});

test("warnNotice carries the server name in its footer", () => {
  const embed = warnNotice({
    guildName: "Serveur",
    reason: "Spam",
    count: 1,
    step: null,
    next: null,
    validDays: 0,
  }).embeds[0].toJSON();
  assert.equal(embed.footer.text, "Serveur");
});

test("closedDmLine only speaks when the member was not reached", () => {
  assert.equal(closedDmLine(true), "");
  assert.equal(
    closedDmLine(false),
    "\n-# Messages privés fermés : le membre n'a pas été prévenu.",
  );
});

test("unwarnNotice is green and says what was lifted", () => {
  const { unwarnNotice } = require("../utils/moderationNotice");
  const one = unwarnNotice({
    guildName: "Serveur",
    moderator: "Izuki",
    count: 1,
    lifted: ["timeout", "timeout"],
  }).embeds[0].toJSON();
  assert.equal(one.title, "Avertissement retiré sur Serveur");
  assert.equal(one.color, COLORS.lifted);
  assert.deepEqual(
    one.fields.map((field) => [field.name, field.value]),
    [["Modérateur", "Izuki"]],
  );
  assert.equal(
    one.description,
    "Un de tes avertissements est retiré.\nTa sourdine est levée.",
  );
  const many = unwarnNotice({
    guildName: "Serveur",
    moderator: "Izuki",
    count: 3,
  }).embeds[0].toJSON();
  assert.equal(many.title, "Avertissements retirés sur Serveur");
  assert.equal(many.description, "3 de tes avertissements sont retirés.");
});
