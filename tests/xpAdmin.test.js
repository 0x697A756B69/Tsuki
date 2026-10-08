const test = require("node:test");
const assert = require("node:assert/strict");
const { ComponentType } = require("discord.js");
const {
  checkMember,
  checkAmount,
  formatAdjustment,
  renderResetConfirm,
} = require("../utils/xpAdmin");

test("checkMember refuses missing members and bots", () => {
  assert.match(checkMember(null), /pas sur le serveur/);
  assert.match(checkMember({ user: { bot: true } }), /bots/);
  assert.equal(checkMember({ user: { bot: false } }), null);
});

test("checkAmount only accepts positive whole numbers", () => {
  for (const amount of [0, -5, 2.5, NaN, Infinity])
    assert.match(checkAmount(amount), /au moins 1 XP/);
  assert.equal(checkAmount(1), null);
  assert.equal(checkAmount(5000), null);
});

test("formatAdjustment describes a gain", () => {
  const text = formatAdjustment("<@1>", {
    level: 2,
    previousTotal: 100,
    total: 350,
  });
  assert.match(text, /<@1> a reçu \*\*250 XP\*\*/);
  assert.match(text, /Niveau 2 · 350 XP au total/);
});

test("formatAdjustment describes a loss", () => {
  const text = formatAdjustment("<@1>", {
    level: 0,
    previousTotal: 80,
    total: 0,
  });
  assert.match(text, /<@1> a perdu \*\*80 XP\*\*/);
  assert.match(text, /Niveau 0 · 0 XP au total/);
});

test("formatAdjustment handles no change", () => {
  const text = formatAdjustment("<@1>", {
    level: 0,
    previousTotal: 0,
    total: 0,
  });
  assert.match(text, /n'a pas changé d'XP/);
});

test("renderResetConfirm shows the total and two buttons", () => {
  const view = renderResetConfirm({ userId: "42", authorId: "7", total: 900 });

  assert.match(view.content, /<@42>/);
  assert.match(view.content, /900 XP/);

  const [row] = view.components;
  assert.equal(row.type, ComponentType.ActionRow);
  assert.deepEqual(
    row.components.map((b) => /** @type {any} */ (b).custom_id),
    ["xp-reset:confirm:42:7", "xp-reset:cancel:42:7"],
  );
});
