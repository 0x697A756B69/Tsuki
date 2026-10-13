const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const migrate = require("../loaders/migrate");
const {
  getRaidSettings,
  updateRaidSettings,
} = require("../utils/raidSettings");
const { updateAutomodSettings } = require("../utils/automodSettings");
const { HOME_SECTIONS } = require("../utils/automodPanel");
const { raidSectionView } = require("../utils/raidSection");
const {
  ACTION_OPTIONS,
  LOCKDOWN_OPTIONS,
  renderRaidResponseView,
  renderRaidView,
  renderThresholdsModal,
  renderTimeoutModal,
} = require("../utils/raidPanel");
const component = require("../components/raid-config");

function createDatabase({ logChannel = "log" } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  if (logChannel) updateAutomodSettings(db, "g", { logChannel }, "admin");
  return db;
}

function json(view) {
  return JSON.stringify(view.components[0].toJSON());
}

function collect(view) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (node.custom_id) found.push(node);
      Object.values(node).forEach(walk);
    }
  };
  walk(view.components[0].toJSON());
  return found;
}

/**
 * @param {string} kind
 * @param {{ values?: string[], fields?: Record<string, string>, flags?: bigint[] }} [options]
 */
function fakeInteraction(kind, options = {}) {
  const { values = [], fields = {}, flags } = options;
  const replies = [];
  return {
    guildId: "g",
    user: { id: "admin" },
    memberPermissions: {
      has: (flag) =>
        (flags ?? [PermissionFlagsBits.ManageGuild]).includes(flag),
    },
    replies,
    values,
    isButton: () => kind === "button",
    isStringSelectMenu: () => kind === "select",
    isModalSubmit: () => kind === "modal",
    isFromMessage: () => true,
    fields: { getTextInputValue: (name) => fields[name] },
    update: async (payload) => replies.push(["update", payload]),
    reply: async (payload) => replies.push(["reply", payload]),
    showModal: async (payload) => replies.push(["modal", payload]),
  };
}

async function run(db, action, interaction) {
  await component.run(
    /** @type {any} */ ({}),
    /** @type {any} */ (interaction),
    [action],
    db,
  );
  return interaction.replies;
}

test("the AutoMod home lists the anti-raid section", () => {
  assert.ok(HOME_SECTIONS.some((section) => section.value === "raid"));
});

test("raidSectionView builds the anti-raid view", () => {
  const db = createDatabase();
  const view = raidSectionView(db, "g");

  assert.match(json(view), /Anti-raid/);
});

test("the anti-raid view shows the state and the logs channel", () => {
  const db = createDatabase();
  const view = renderRaidView({
    settings: getRaidSettings(db, "g"),
    logChannel: "log",
  });

  assert.match(json(view), /Désactivée/);
  assert.match(json(view), /<#log>/);
  assert.match(json(view), /Vigilance à 5, Alerte à 8, Raid à 10/);
});

test("the anti-raid view warns when there is no logs channel", () => {
  const db = createDatabase();
  const view = renderRaidView({
    settings: getRaidSettings(db, "g"),
    logChannel: null,
  });

  assert.match(json(view), /Aucun salon de logs/);
});

test("the anti-raid view pre-selects the active signals", () => {
  const db = createDatabase();
  updateRaidSettings(
    db,
    "g",
    { signalAvatar: false, signalInvite: false },
    "a",
  );
  const view = renderRaidView({
    settings: getRaidSettings(db, "g"),
    logChannel: "log",
  });
  const select = collect(view).find(
    (node) => node.custom_id === "raid-config:signals",
  );

  assert.deepEqual(
    select.options.filter((option) => option.default).map((o) => o.value),
    ["age", "names", "burst"],
  );
  assert.equal(select.min_values, 0);
});

test("the response view has one select per tier and one for the lockdown", () => {
  const db = createDatabase();
  updateRaidSettings(
    db,
    "g",
    { alertAction: "timeout", lockdown: "invites" },
    "a",
  );
  const view = renderRaidResponseView({ settings: getRaidSettings(db, "g") });
  const selects = collect(view).filter((node) => node.options);

  assert.deepEqual(
    selects.map((node) => node.custom_id),
    [
      "raid-config:watch-action",
      "raid-config:alert-action",
      "raid-config:raid-action",
      "raid-config:lockdown",
    ],
  );
  const defaults = selects.map(
    (node) => node.options.find((option) => option.default)?.value,
  );
  assert.deepEqual(defaults, ["log", "timeout", "log", "invites"]);
  assert.equal(
    view.components[0].toJSON().components.filter((c) => c.type === 1).length,
    5,
  );
});

test("the options cover every action and lockdown", () => {
  assert.deepEqual(
    ACTION_OPTIONS.map((option) => option.value),
    ["log", "timeout", "quarantine", "kick", "ban"],
  );
  assert.deepEqual(
    LOCKDOWN_OPTIONS.map((option) => option.value),
    ["off", "invites", "verification"],
  );
});

test("the modals carry the current values", () => {
  const db = createDatabase();
  const settings = getRaidSettings(db, "g");
  const thresholds = renderThresholdsModal({ settings }).toJSON();
  const timeout = renderTimeoutModal({ settings }).toJSON();

  assert.equal(thresholds.custom_id, "raid-config:save-thresholds");
  assert.match(JSON.stringify(thresholds), /5 \/ 8 \/ 10/);
  assert.equal(timeout.custom_id, "raid-config:save-timeout");
  assert.match(JSON.stringify(timeout), /"value":"60"/);
});

test("the component needs the Manage Server permission", async () => {
  const db = createDatabase();
  const replies = await run(
    db,
    "enabled-toggle",
    fakeInteraction("button", { flags: [] }),
  );

  assert.match(replies[0][1].content, /Gérer le serveur/);
  assert.equal(replies[0][1].flags, MessageFlags.Ephemeral);
  assert.equal(getRaidSettings(db, "g").enabled, false);
});

test("the enable button turns the detection on and off", async () => {
  const db = createDatabase();
  await run(db, "enabled-toggle", fakeInteraction("button"));
  assert.equal(getRaidSettings(db, "g").enabled, true);

  await run(db, "enabled-toggle", fakeInteraction("button"));
  assert.equal(getRaidSettings(db, "g").enabled, false);
});

test("the enable button refuses without a logs channel", async () => {
  const db = createDatabase({ logChannel: null });
  const replies = await run(db, "enabled-toggle", fakeInteraction("button"));

  assert.match(replies[0][1].content, /salon de logs/);
  assert.equal(getRaidSettings(db, "g").enabled, false);
});

test("the observation and scope buttons toggle their setting", async () => {
  const db = createDatabase();
  await run(db, "observation-toggle", fakeInteraction("button"));
  await run(db, "scope-toggle", fakeInteraction("button"));
  const settings = getRaidSettings(db, "g");

  assert.equal(settings.observation, true);
  assert.equal(settings.scope, "all");
  await run(db, "scope-toggle", fakeInteraction("button"));
  assert.equal(getRaidSettings(db, "g").scope, "suspect");
});

test("the signals select saves the chosen signals", async () => {
  const db = createDatabase();
  await run(
    db,
    "signals",
    fakeInteraction("select", { values: ["age", "burst"] }),
  );
  const settings = getRaidSettings(db, "g");

  assert.equal(settings.signalAge, true);
  assert.equal(settings.signalBurst, true);
  assert.equal(settings.signalAvatar, false);
  assert.equal(settings.signalNames, false);
  assert.equal(settings.signalInvite, false);
});

test("the tier selects save the action of their tier", async () => {
  const db = createDatabase();
  await run(
    db,
    "watch-action",
    fakeInteraction("select", { values: ["timeout"] }),
  );
  await run(
    db,
    "alert-action",
    fakeInteraction("select", { values: ["quarantine"] }),
  );
  await run(db, "raid-action", fakeInteraction("select", { values: ["ban"] }));
  const settings = getRaidSettings(db, "g");

  assert.equal(settings.watchAction, "timeout");
  assert.equal(settings.alertAction, "quarantine");
  assert.equal(settings.raidAction, "ban");
});

test("the tier selects refuse an unknown action", async () => {
  const db = createDatabase();
  const replies = await run(
    db,
    "alert-action",
    fakeInteraction("select", { values: ["explode"] }),
  );

  assert.match(replies[0][1].content, /n'existe pas/);
  assert.equal(getRaidSettings(db, "g").alertAction, "log");
});

test("the lockdown select saves the mode and refuses unknown ones", async () => {
  const db = createDatabase();
  await run(
    db,
    "lockdown",
    fakeInteraction("select", { values: ["verification"] }),
  );
  assert.equal(getRaidSettings(db, "g").lockdown, "verification");

  const replies = await run(
    db,
    "lockdown",
    fakeInteraction("select", { values: ["nope"] }),
  );
  assert.match(replies[0][1].content, /n'existe pas/);
  assert.equal(getRaidSettings(db, "g").lockdown, "verification");
});

test("the thresholds modal saves valid values", async () => {
  const db = createDatabase();
  await run(
    db,
    "save-thresholds",
    fakeInteraction("modal", {
      fields: {
        window: "15",
        calm: "30",
        thresholds: "6 / 9 / 12",
        accountDays: "3",
      },
    }),
  );
  const settings = getRaidSettings(db, "g");

  assert.equal(settings.windowMinutes, 15);
  assert.equal(settings.calmMinutes, 30);
  assert.equal(settings.raidJoins, 12);
  assert.equal(settings.accountDays, 3);
});

test("the thresholds modal refuses invalid values and changes nothing", async () => {
  const db = createDatabase();
  const replies = await run(
    db,
    "save-thresholds",
    fakeInteraction("modal", {
      fields: {
        window: "15",
        calm: "30",
        thresholds: "12 / 9 / 6",
        accountDays: "3",
      },
    }),
  );

  assert.match(replies[0][1].content, /trois entiers croissants/);
  assert.equal(getRaidSettings(db, "g").windowMinutes, 10);
});

test("the timeout modal saves the duration", async () => {
  const db = createDatabase();
  await run(
    db,
    "save-timeout",
    fakeInteraction("modal", { fields: { minutes: "120" } }),
  );
  assert.equal(getRaidSettings(db, "g").timeoutMinutes, 120);

  const replies = await run(
    db,
    "save-timeout",
    fakeInteraction("modal", { fields: { minutes: "0" } }),
  );
  assert.match(replies[0][1].content, /entre 1 et 40320/);
  assert.equal(getRaidSettings(db, "g").timeoutMinutes, 120);
});

test("the navigation buttons open the views and modals", async () => {
  const db = createDatabase();
  const response = await run(db, "response", fakeInteraction("button"));
  assert.match(json(response[0][1]), /Réponses au raid/);

  const back = await run(db, "raid", fakeInteraction("button"));
  assert.match(json(back[0][1]), /Anti-raid/);

  const modal = await run(db, "thresholds", fakeInteraction("button"));
  assert.equal(modal[0][0], "modal");
});

test("the anti-raid view has a simulation button", () => {
  const db = createDatabase();
  const view = renderRaidView({
    settings: getRaidSettings(db, "g"),
    logChannel: "log",
  });

  assert.ok(
    collect(view).some((node) => node.custom_id === "raid-config:simulate"),
  );
});

test("the simulation button answers privately without changing anything", async () => {
  const db = createDatabase();
  updateRaidSettings(db, "g", { raidAction: "ban" }, "admin");
  const before = getRaidSettings(db, "g");
  const replies = await run(db, "simulate", fakeInteraction("button"));

  assert.equal(replies[0][1].flags, MessageFlags.Ephemeral);
  assert.match(replies[0][1].content, /Simulation/);
  assert.match(replies[0][1].content, /Raid probable.*banni/);
  assert.deepEqual(getRaidSettings(db, "g"), before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM raid_joins").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM raid_tiers").get().n, 0);
});
