const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { createDatabase } = require("../helpers/database");
const component = require("../../components/automod-config");
const {
  getAutomodSettings,
} = require("../../utils/automod/automodSettings");

function select(value) {
  const updates = [];
  const replies = [];
  const interaction = /** @type {any} */ ({
    guildId: "g",
    guild: { name: "Tsuki", channels: { cache: new Map() } },
    user: { id: "admin" },
    memberPermissions: {
      has: (flag) => flag === PermissionFlagsBits.ManageGuild,
    },
    isButton: () => false,
    isStringSelectMenu: () => true,
    values: [value],
    update: async (payload) => updates.push(payload),
    reply: async (payload) => replies.push(payload),
  });
  const run = () =>
    component.run(
      /** @type {any} */ ({}),
      interaction,
      ["goto"],
      createDatabase(),
    );
  return { run, updates, replies };
}

test("choosing a section opens its view", async () => {
  const { run, updates } = select("mute");
  await run();

  assert.match(JSON.stringify(updates[0]), /Sourdine/);
});

test("choosing the anti-raid section opens the raid view", async () => {
  const { run, updates } = select("raid");
  await run();

  assert.match(JSON.stringify(updates[0]), /Anti-raid/);
});

test("choosing an unknown section is refused", async () => {
  const { run, updates, replies } = select("profile");
  await run();

  assert.equal(updates.length, 0);
  assert.match(replies[0].content, /n'existe pas/);
});

function reminderModal(hours, db = createDatabase()) {
  const updates = [];
  const replies = [];
  const interaction = /** @type {any} */ ({
    guildId: "g",
    guild: { name: "Tsuki", channels: { cache: new Map() } },
    user: { id: "admin" },
    memberPermissions: {
      has: (flag) => flag === PermissionFlagsBits.ManageGuild,
    },
    isButton: () => false,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isModalSubmit: () => true,
    isFromMessage: () => true,
    fields: { getTextInputValue: () => hours },
    update: async (payload) => updates.push(payload),
    reply: async (payload) => replies.push(payload),
  });
  const run = () =>
    component.run(/** @type {any} */ ({}), interaction, ["save-reminder"], db);
  return { run, updates, replies, db };
}

test("saving the reminder delay updates the justice view", async () => {
  const { run, updates, db } = reminderModal("6");
  await run();

  assert.equal(getAutomodSettings(db, "g").reminderHours, 6);
  assert.match(JSON.stringify(updates[0]), /6 h avant la suppression/);
});

test("saving a reminder delay above 12 hours is refused", async () => {
  const { run, updates, replies, db } = reminderModal("13");
  await run();

  assert.equal(updates.length, 0);
  assert.match(replies[0].content, /entre 0 et 12 heures/);
  assert.equal(getAutomodSettings(db, "g").reminderHours, 1);
});
