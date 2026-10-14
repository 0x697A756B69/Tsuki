const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const {
  updateAutomodSettings,
} = require("../../utils/automod/automodSettings");
const { updateRaidSettings } = require("../../utils/raid/raidSettings");
const { MINUTE } = require("../../utils/raid/raidDetector");
const { getLastTier, recordTier } = require("../../utils/raid/raidLog");
const {
  MAX_LISTED,
  TITLES,
  buildRaidAlert,
  sendRaidAlert,
  sweepRaids,
} = require("../../utils/raid/raidAlert");
const { createDatabase } = require("../helpers/database");

const NOW = 1700000000000;

function render(changes = {}) {
  const message = buildRaidAlert({
    tier: "alert",
    count: 8,
    windowMinutes: 10,
    members: [
      { user: "1", signals: ["age", "avatar"] },
      { user: "2", signals: [] },
    ],
    date: NOW,
    ...changes,
  });
  return JSON.stringify(message.components[0].toJSON());
}

function createGuild(sent, channelId = "log") {
  return {
    id: "g",
    channels: {
      cache: new Map([
        [
          channelId,
          {
            isTextBased: () => true,
            send: async (payload) => {
              sent.push(payload);
              return { id: `m${sent.length}` };
            },
          },
        ],
      ]),
    },
  };
}

test("buildRaidAlert is a components v2 message that pings nobody", () => {
  const message = buildRaidAlert({
    tier: "watch",
    count: 5,
    windowMinutes: 10,
    date: NOW,
  });

  assert.equal(message.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.equal(message.components.length, 1);
});

test("buildRaidAlert titles each tier and uses a different color", () => {
  const colors = new Set();
  for (const tier of ["calm", "watch", "alert", "raid"]) {
    const message = buildRaidAlert({ tier, count: 5, windowMinutes: 10 });
    const json = message.components[0].toJSON();
    assert.match(JSON.stringify(json), new RegExp(TITLES[tier]));
    colors.add(json.accent_color);
  }
  assert.equal(colors.size, 4);
});

test("buildRaidAlert shows the count, the window and the members with their signals", () => {
  const json = render();

  assert.match(json, /8 en 10 minutes/);
  assert.match(json, /<@1> · Compte récent, Sans avatar/);
  assert.match(json, /<@2> · aucun signal/);
});

test("buildRaidAlert uses the singular for one minute", () => {
  assert.match(render({ windowMinutes: 1 }), /8 en 1 minute[^s]/);
});

test("buildRaidAlert lists at most ten members and counts the others", () => {
  const members = Array.from({ length: MAX_LISTED + 3 }, (_, index) => ({
    user: `u${index}`,
    signals: [],
  }));
  const json = render({ members });

  assert.match(json, new RegExp(`<@u${MAX_LISTED - 1}>`));
  assert.doesNotMatch(json, new RegExp(`<@u${MAX_LISTED}>`));
  assert.match(json, /… et 3 autres/);
});

test("buildRaidAlert for calm shows no arrivals and no members", () => {
  const json = render({ tier: "calm", count: 0 });

  assert.match(json, /revenues à un rythme normal/);
  assert.doesNotMatch(json, /Arrivées/);
  assert.doesNotMatch(json, /<@1>/);
});

test("buildRaidAlert says when it only observes and when the date is", () => {
  assert.match(
    render({ observed: true }),
    /Observation : rien n'a été appliqué/,
  );
  assert.match(render({ observed: false }), /Aucune sanction/);
  assert.match(render(), /<t:1700000000:f>/);
});

test("sendRaidAlert sends the alert to the channel and returns the message", async () => {
  const sent = [];
  const message = await sendRaidAlert(createGuild(sent), "log", {
    tier: "raid",
    count: 10,
    windowMinutes: 10,
  });

  assert.equal(sent.length, 1);
  assert.equal(message.id, "m1");
});

test("sendRaidAlert returns null without a channel, with a missing one or on failure", async () => {
  const sent = [];
  const data = { tier: "raid", count: 10, windowMinutes: 10 };

  assert.equal(await sendRaidAlert(createGuild(sent), null, data), null);
  assert.equal(await sendRaidAlert(createGuild(sent), "gone", data), null);

  const broken = createGuild(sent);
  broken.channels.cache.get("log").send = async () => {
    throw new Error("missing access");
  };
  assert.equal(await sendRaidAlert(broken, "log", data), null);
  assert.equal(sent.length, 0);
});

function createBot(sent, state = { tier: "raid", heldAt: NOW }) {
  const db = createDatabase();
  updateRaidSettings(db, "g", { enabled: true, scope: "all" }, "admin");
  updateAutomodSettings(db, "g", { logChannel: "log" }, "admin");
  recordTier(db, "g", state.tier, 10, false, state.heldAt);
  return {
    db,
    raidMemory: new Map([["g", { recent: [], state }]]),
    guilds: { cache: new Map([["g", createGuild(sent)]]) },
  };
}

test("sweepRaids announces the return to calm once the delay has passed", async () => {
  const sent = [];
  const bot = createBot(sent);

  assert.equal(await sweepRaids(bot, NOW + 5 * MINUTE), 0);
  assert.equal(sent.length, 0);

  assert.equal(await sweepRaids(bot, NOW + 10 * MINUTE), 1);
  assert.equal(sent.length, 1);
  assert.match(
    JSON.stringify(sent[0].components[0].toJSON()),
    /Retour au calme/,
  );
  assert.equal(getLastTier(bot.db, "g").tier, "calm");

  assert.equal(await sweepRaids(bot, NOW + 30 * MINUTE), 0);
  assert.equal(sent.length, 1);
});

test("sweepRaids skips calm guilds, disabled guilds and guilds that left", async () => {
  const sent = [];
  const calm = createBot(sent, { tier: "calm", heldAt: NOW });
  assert.equal(await sweepRaids(calm, NOW + 60 * MINUTE), 0);

  const disabled = createBot(sent);
  updateRaidSettings(disabled.db, "g", { enabled: false }, "admin");
  assert.equal(await sweepRaids(disabled, NOW + 60 * MINUTE), 0);

  const gone = createBot(sent);
  gone.guilds.cache.clear();
  assert.equal(await sweepRaids(gone, NOW + 60 * MINUTE), 0);

  assert.equal(sent.length, 0);
});

test("sweepRaids does nothing before any join has been seen", async () => {
  const bot = { db: createDatabase(), guilds: { cache: new Map() } };

  assert.equal(await sweepRaids(bot, NOW), 0);
});

test("buildRaidAlert tells what was applied and what failed", () => {
  const text = render({
    response: {
      action: "timeout",
      observed: false,
      planned: ["1", "2", "3"],
      done: ["1", "2"],
      failed: ["3"],
    },
  });

  assert.match(text, /Appliqué :\*\* mis en sourdine · 2 membres/);
  assert.match(text, /Échec :\*\* 1 membre/);
  assert.match(text, /Sanctions appliquées automatiquement/);
});

test("buildRaidAlert tells what would have been applied in observation", () => {
  const text = render({
    observed: true,
    response: {
      action: "ban",
      observed: true,
      planned: ["1", "2"],
      done: [],
      failed: [],
    },
  });

  assert.match(text, /Aurait été appliqué :\*\* banni · 2 membres/);
  assert.match(text, /Observation : rien n.a été appliqué/);
});

test("buildRaidAlert shows no action line for a log-only response", () => {
  const text = render({
    response: {
      action: "log",
      observed: false,
      planned: [],
      done: [],
      failed: [],
    },
  });

  assert.doesNotMatch(text, /Appliqué|Aurait été|Échec/);
});

test("buildRaidAlert tells when the lockdown starts and ends", () => {
  const start = render({
    lockdown: { action: "engage", mode: "invites", observed: false, ok: true },
  });
  assert.match(start, /Verrouillage :\*\* invitations en pause/);

  const end = render({
    lockdown: { action: "release", mode: "invites", observed: false, ok: true },
  });
  assert.match(end, /Verrouillage levé/);
});

test("buildRaidAlert tells when the lockdown would have happened or failed", () => {
  const planned = render({
    lockdown: {
      action: "engage",
      mode: "verification",
      observed: true,
      ok: true,
    },
  });
  assert.match(planned, /Aurait été verrouillé :\*\* vérification maximale/);

  const failed = render({
    lockdown: { action: "engage", mode: "invites", observed: false, ok: false },
  });
  assert.match(failed, /Échec du verrouillage/);

  const stuck = render({
    lockdown: {
      action: "release",
      mode: "invites",
      observed: false,
      ok: false,
    },
  });
  assert.match(stuck, /Échec de la levée/);
});

test("sweepRaids lifts the lockdown once the raid is over", async () => {
  const db = createDatabase();
  updateRaidSettings(
    db,
    "g",
    { enabled: true, scope: "all", lockdown: "invites" },
    "admin",
  );
  db.prepare(
    "INSERT INTO raid_lockdowns (guild, mode, previous_level, previous_invites_until, started_at) VALUES ('g', 'invites', NULL, NULL, 1)",
  ).run();
  const actions = [];
  const sent = [];
  const guild = createGuild(sent);
  guild.setIncidentActions = async (value) => actions.push(value);
  const bot = {
    db,
    guilds: { cache: new Map([["g", guild]]) },
    raidMemory: new Map([
      ["g", { recent: [], state: { tier: "calm", heldAt: NOW } }],
    ]),
  };

  await sweepRaids(bot, NOW);

  assert.deepEqual(actions, [{ invitesDisabledUntil: null }]);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM raid_lockdowns").get().n,
    0,
  );
});

test("buildRaidAlert tells the cause of the failures", () => {
  const json = render({
    response: {
      action: "ban",
      observed: false,
      planned: ["3"],
      done: [],
      failed: ["3"],
      causes: ["membre introuvable"],
    },
  });

  assert.match(json, /Échec.*(membre introuvable)/);
});
