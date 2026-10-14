const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const migrate = require("../loaders/migrate");
const { updateRaidSettings } = require("../utils/raidSettings");
const { MINUTE } = require("../utils/raidDetector");
const { parseCustomId } = require("../utils/core/customId");
const {
  RAID_ACTION_ID,
  RAID_ACTIONS,
  banGroupConfirmation,
  buildRaidButtons,
  missingRaidPermission,
  parseRaidAction,
} = require("../utils/raidButtons");
const { buildRaidAlert } = require("../utils/raidAlert");
const component = require("../components/raid-action");

const NOW = Date.now();

function permissions(...flags) {
  return { has: (flag) => flags.includes(flag) };
}

function createFixture() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  updateRaidSettings(
    db,
    "g",
    { enabled: true, scope: "all", quarantineRole: "sas" },
    "admin",
  );
  const calls = [];
  const guild = {
    id: "g",
    members: {
      cache: new Map(),
      fetch: async (id) => ({
        timeout: async () => calls.push(["untimeout", id]),
        roles: { remove: async () => calls.push(["unrole", id]) },
      }),
      ban: async (id) => calls.push(["ban", id]),
    },
    verificationLevel: 1,
    incidentsData: null,
    setIncidentActions: async () => {},
  };
  const bot = {
    db,
    raidMemory: new Map([
      [
        "g",
        {
          recent: [
            { user: "a", signals: ["age"] },
            { user: "b", signals: [] },
          ],
          state: { tier: "raid", heldAt: NOW - 5 * MINUTE },
          handled: new Map([["a", "timeout"]]),
          freed: new Set(),
        },
      ],
    ]),
  };
  return { db, bot, guild, calls };
}

function click(guild, flags, action) {
  const replies = [];
  return {
    guild,
    guildId: "g",
    replies,
    memberPermissions: permissions(...flags),
    isButton: () => true,
    reply: async (payload) => replies.push(["reply", payload]),
    deferReply: async () => replies.push(["defer"]),
    editReply: async (payload) => replies.push(["edit", payload]),
    update: async (payload) => replies.push(["update", payload]),
    action,
  };
}

const ALL = [
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ManageGuild,
];

async function run(fixture, action, flags = ALL) {
  const interaction = click(fixture.guild, flags);
  await component.run(
    fixture.bot,
    /** @type {any} */ (interaction),
    [action],
    fixture.db,
  );
  return interaction.replies;
}

test("RAID_ACTIONS ask for the matching permission", () => {
  assert.equal(
    RAID_ACTIONS.free.permission,
    PermissionFlagsBits.ModerateMembers,
  );
  assert.equal(RAID_ACTIONS.ban.permission, PermissionFlagsBits.BanMembers);
  assert.equal(RAID_ACTIONS.banok.permission, PermissionFlagsBits.BanMembers);
  assert.equal(RAID_ACTIONS.lift.permission, PermissionFlagsBits.ManageGuild);
  assert.equal(RAID_ACTIONS.extend.permission, PermissionFlagsBits.ManageGuild);
  assert.equal(RAID_ACTIONS.bancancel.permission, null);
});

test("parseRaidAction accepts known actions only", () => {
  assert.deepEqual(parseRaidAction(["lift"]), { action: "lift" });
  assert.equal(parseRaidAction(["unknown"]), null);
  assert.equal(parseRaidAction([]), null);
});

test("missingRaidPermission names the missing permission", () => {
  assert.match(
    missingRaidPermission("ban", permissions()),
    /Bannir des membres/,
  );
  assert.equal(
    missingRaidPermission("ban", permissions(PermissionFlagsBits.BanMembers)),
    null,
  );
  assert.equal(missingRaidPermission("bancancel", permissions()), null);
});

test("buildRaidButtons has the four controls with raid-action ids", () => {
  const buttons = /** @type {any[]} */ (buildRaidButtons().toJSON().components);

  assert.deepEqual(
    buttons.map((button) => button.label),
    ["Libérer", "Bannir le groupe", "Tout lever", "Prolonger"],
  );
  assert.deepEqual(
    buttons.map((button) => parseCustomId(button.custom_id)),
    [
      { id: RAID_ACTION_ID, params: ["free"] },
      { id: RAID_ACTION_ID, params: ["ban"] },
      { id: RAID_ACTION_ID, params: ["lift"] },
      { id: RAID_ACTION_ID, params: ["extend"] },
    ],
  );
});

test("banGroupConfirmation explains the signals and is private", () => {
  const message = banGroupConfirmation({
    users: ["1", "2"],
    signals: { "Compte récent": 2, "Sans avatar": 1 },
  });

  assert.equal(message.flags, MessageFlags.Ephemeral);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.match(message.content, /2\*\* membres/);
  assert.match(message.content, /Compte récent : 2 · Sans avatar : 1/);
  assert.deepEqual(
    /** @type {any[]} */ (message.components[0].toJSON().components).map(
      (button) => button.label,
    ),
    ["Confirmer le bannissement", "Annuler"],
  );
});

test("banGroupConfirmation says so when there is no signal", () => {
  const message = banGroupConfirmation({ users: ["1"], signals: {} });

  assert.match(message.content, /arrivée groupée/);
});

test("raid alerts carry the buttons unless calm", () => {
  const withButtons = (tier) =>
    JSON.stringify(
      buildRaidAlert({
        tier,
        count: 5,
        windowMinutes: 10,
      }).components[0].toJSON(),
    );

  assert.match(withButtons("raid"), /raid-action:lift/);
  assert.match(withButtons("watch"), /raid-action:free/);
  assert.doesNotMatch(withButtons("calm"), /raid-action/);
});

test("the component refuses without the permission", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "ban", []);

  assert.match(replies[0][1].content, /Bannir des membres/);
  assert.equal(replies[0][1].flags, MessageFlags.Ephemeral);
  assert.deepEqual(fixture.calls, []);
});

test("the component refuses an unknown button", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "nope");

  assert.match(replies[0][1].content, /n'est plus actif/);
});

test("free releases the group and says how many", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "free");

  assert.deepEqual(fixture.calls, [["untimeout", "a"]]);
  assert.match(replies.at(-1)[1].content, /1 membre libéré/);
});

test("ban shows a confirmation without banning yet", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "ban");

  assert.deepEqual(fixture.calls, []);
  assert.match(replies[0][1].content, /Bannir \*\*2\*\* membres/);
});

test("ban says so when nobody is left to ban", async () => {
  const fixture = createFixture();
  fixture.bot.raidMemory.get("g").recent = [];
  const replies = await run(fixture, "ban");

  assert.match(replies[0][1].content, /aucun membre à bannir/);
});

test("banok bans the group", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "banok");

  assert.deepEqual(fixture.calls, [
    ["ban", "a"],
    ["ban", "b"],
  ]);
  assert.match(replies.at(-1)[1].content, /2 membres bannis/);
});

test("bancancel cancels without banning", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "bancancel", []);

  assert.deepEqual(fixture.calls, []);
  assert.match(replies[0][1].content, /annulé/);
});

test("lift goes back to calm", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "lift");

  assert.match(replies.at(-1)[1].content, /Retour au calme/);
  assert.equal(fixture.bot.raidMemory.get("g").state.tier, "calm");
});

test("extend renews the hold and gives the time", async () => {
  const fixture = createFixture();
  const replies = await run(fixture, "extend");

  assert.match(replies[0][1].content, /Palier maintenu.*<t:\d+:t>/);
  assert.ok(fixture.bot.raidMemory.get("g").state.heldAt > NOW - MINUTE);
});

test("extend says so when there is no raid", async () => {
  const fixture = createFixture();
  fixture.bot.raidMemory.get("g").state = { tier: "calm", heldAt: NOW };
  const replies = await run(fixture, "extend");

  assert.match(replies[0][1].content, /Aucun raid/);
});
