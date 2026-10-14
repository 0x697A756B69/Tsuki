const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { addXp, getTotalXp } = require("../utils/xp/xp");
const { setReward } = require("../utils/xp/rewards");
const { totalXpForLevel } = require("../utils/xp/levels");
const reset = require("../commands/xp/reset");
const xpReset = require("../components/xp-reset");
const { createDatabase } = require("./helpers/database");

function commandInteraction(type) {
  const calls = [];
  return /** @type {any} */ ({
    calls,
    guildId: "g",
    user: { id: "admin" },
    reply: async (payload) => calls.push(payload),
    options: {
      getUser: () => ({ id: "42", toString: () => "<@42>" }),
      getString: () => type,
    },
  });
}

test("/xp reset offers the all, messages and voice types", () => {
  const option = reset.options.find((o) => o.name === "type");
  assert.equal(option.type, "string");
  assert.equal(option.required ?? false, false);
  assert.deepEqual(
    option.choices.map((c) => c.value),
    ["all", "messages", "voice"],
  );
});

test("/xp reset asks for a confirmation with the total before and after", async () => {
  const db = createDatabase();
  addXp(db, "g", "42", 300, "messages");
  addXp(db, "g", "42", 100, "voice");
  const interaction = commandInteraction("voice");

  await reset.run(null, interaction, interaction.options, db);

  const [payload] = interaction.calls;
  assert.match(payload.content, /\*\*400 XP\*\* à \*\*300 XP\*\*/);
  assert.ok(payload.flags);
  assert.equal(
    payload.components[0].components[0].custom_id,
    "xp-reset:confirm:42:admin:voice",
  );
});

test("/xp reset defaults to everything", async () => {
  const db = createDatabase();
  addXp(db, "g", "42", 300, "messages");
  const interaction = commandInteraction(null);

  await reset.run(null, interaction, interaction.options, db);

  assert.match(interaction.calls[0].content, /\(tout\)/);
});

test("/xp reset refuses when the chosen type has no XP", async () => {
  const db = createDatabase();
  addXp(db, "g", "42", 300, "messages");
  const interaction = commandInteraction("voice");

  await reset.run(null, interaction, interaction.options, db);

  assert.match(interaction.calls[0].content, /pas d'XP à réinitialiser/);
  assert.equal(interaction.calls[0].components, undefined);
});

function buttonInteraction(role) {
  const updates = [];
  const member = {
    id: "42",
    guild: { roles: { cache: new Map([[role, {}]]) } },
    roles: {
      cache: new Map([[role, {}]]),
      add: async () => {},
      remove: async (roles) => updates.push(["removed", roles]),
    },
  };
  return /** @type {any} */ ({
    updates,
    guildId: "g",
    user: { id: "admin" },
    memberPermissions: { has: (p) => p === PermissionFlagsBits.ManageGuild },
    guild: { members: { fetch: async () => member } },
    isButton: () => true,
    reply: async (payload) => updates.push(["reply", payload]),
    update: async (payload) => updates.push(["update", payload]),
  });
}

test("confirming a voice reset clears only the voice XP and reports the totals", async () => {
  const db = createDatabase();
  addXp(db, "g", "42", 300, "messages");
  addXp(db, "g", "42", 100, "voice");
  const interaction = buttonInteraction("role");

  await xpReset.run(null, interaction, ["confirm", "42", "admin", "voice"], db);

  assert.equal(getTotalXp(db, "g", "42"), 300);
  const [name, payload] = interaction.updates.at(-1);
  assert.equal(name, "update");
  assert.match(payload.content, /\*\*400 XP\*\* → \*\*300 XP\*\*/);
});

test("confirming a reset removes the reward roles the new level no longer earns", async () => {
  const db = createDatabase();
  setReward(db, "g", 10, "role");
  addXp(db, "g", "42", totalXpForLevel(10), "voice");
  const interaction = buttonInteraction("role");

  await xpReset.run(null, interaction, ["confirm", "42", "admin", "voice"], db);

  assert.deepEqual(interaction.updates[0], ["removed", ["role"]]);
});

test("confirming a reset without a type resets everything", async () => {
  const db = createDatabase();
  addXp(db, "g", "42", 300, "messages");
  addXp(db, "g", "42", 40, "manual");
  const interaction = buttonInteraction("role");

  await xpReset.run(null, interaction, ["confirm", "42", "admin"], db);

  assert.equal(getTotalXp(db, "g", "42"), 0);
});

test("only the author can confirm, and cancelling changes nothing", async () => {
  const db = createDatabase();
  addXp(db, "g", "42", 300, "messages");
  const stranger = buttonInteraction("role");
  stranger.user = { id: "other" };
  await xpReset.run(null, stranger, ["confirm", "42", "admin", "all"], db);
  assert.equal(getTotalXp(db, "g", "42"), 300);

  const cancel = buttonInteraction("role");
  await xpReset.run(null, cancel, ["cancel", "42", "admin", "all"], db);
  assert.equal(getTotalXp(db, "g", "42"), 300);
  assert.match(cancel.updates[0][1].content, /annulée/);
});
