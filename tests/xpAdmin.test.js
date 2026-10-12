const test = require("node:test");
const assert = require("node:assert/strict");
const { ComponentType } = require("discord.js");
const {
  checkMember,
  checkAmount,
  formatAdjustment,
  renderResetConfirm,
  formatResetDone,
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
  const view = renderResetConfirm({
    userId: "42",
    authorId: "7",
    before: 900,
    after: 0,
  });

  assert.match(view.content, /<@42>/);
  assert.match(view.content, /\*\*900 XP\*\* à \*\*0 XP\*\*/);

  const [row] = view.components;
  assert.equal(row.type, ComponentType.ActionRow);
  assert.deepEqual(
    row.components.map((b) => /** @type {any} */ (b).custom_id),
    ["xp-reset:confirm:42:7:all", "xp-reset:cancel:42:7:all"],
  );
});

test("renderResetConfirm carries the type in its buttons and text", () => {
  const view = renderResetConfirm({
    userId: "42",
    authorId: "7",
    type: "voice",
    before: 900,
    after: 600,
  });

  assert.match(view.content, /\(vocal\)/);
  assert.match(view.content, /\*\*900 XP\*\* à \*\*600 XP\*\*/);
  assert.deepEqual(
    view.components[0].components.map((b) => /** @type {any} */ (b).custom_id),
    ["xp-reset:confirm:42:7:voice", "xp-reset:cancel:42:7:voice"],
  );
});

test("renderResetConfirm rejects an unknown type", () => {
  assert.throws(
    () =>
      renderResetConfirm({
        userId: "42",
        authorId: "7",
        type: "other",
        before: 1,
        after: 0,
      }),
    RangeError,
  );
});

test("formatResetDone shows the total before and after", () => {
  const text = formatResetDone({
    userId: "42",
    type: "messages",
    before: 900,
    after: 350,
  });

  assert.match(text, /<@42>/);
  assert.match(text, /\(messages\)/);
  assert.match(text, /\*\*900 XP\*\* → \*\*350 XP\*\*/);
});
