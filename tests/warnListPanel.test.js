const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { MessageFlags } = require("discord.js");
const { insertWarning, noteSanction } = require("../utils/warnSanctions");
const {
  PAGE_SIZE,
  pageCount,
  clampPage,
  sanctionText,
  warningText,
  warnlistView,
} = require("../utils/warnlistPanel");
const component = require("../components/warnlist");

const DAY = 24 * 60 * 60 * 1000;
const USER = { id: "u", tag: "kyo" };

function warning(overrides = {}) {
  return {
    id: "WARN-1",
    author: "mod",
    reason: "Spam",
    date: 120_000,
    sanction: null,
    timeoutUntil: null,
    active: true,
    expiresAt: null,
    ...overrides,
  };
}

function many(count) {
  return Array.from({ length: count }, (_, index) =>
    warning({ id: `WARN-${index}` }),
  );
}

function json(view) {
  return view.components[0].toJSON();
}

function texts(view) {
  return json(view)
    .components.filter((part) => part.type === 10)
    .map((part) => part.content);
}

function buttons(view) {
  return json(view).components.find((part) => part.type === 1).components;
}

test("pageCount always has at least one page", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(PAGE_SIZE), 1);
  assert.equal(pageCount(PAGE_SIZE + 1), 2);
});

test("clampPage stays inside the pages", () => {
  assert.equal(clampPage(-3, 25), 0);
  assert.equal(clampPage(1, 25), 1);
  assert.equal(clampPage(9, 25), 2);
  assert.equal(clampPage(4, 0), 0);
});

test("sanctionText says what the warning caused", () => {
  assert.equal(sanctionText(warning()), "Aucune sanction");
  assert.equal(
    sanctionText(warning({ sanction: "timeout", timeoutUntil: 600_000 })),
    "Sourdine jusqu'au <t:600:f>",
  );
  assert.equal(sanctionText(warning({ sanction: "timeout" })), "Sourdine");
  assert.equal(sanctionText(warning({ sanction: "kick" })), "Expulsion");
  assert.equal(sanctionText(warning({ sanction: "ban" })), "Bannissement");
});

test("warningText gives the state, the facts and the expiry on three lines", () => {
  assert.deepEqual(warningText(warning({ expiresAt: 900_000 })).split("\n"), [
    "**WARN-1** · actif",
    "Spam · par <@mod> · <t:120:f>",
    "Aucune sanction · expire le <t:900:D>",
  ]);
});

test("warningText marks an expired warning and drops the expiry", () => {
  const lines = warningText(
    warning({ active: false, expiresAt: 900_000 }),
  ).split("\n");
  assert.equal(lines[0], "**WARN-1** · expiré");
  assert.equal(lines[2], "Aucune sanction");
});

test("warningText shortens a very long reason", () => {
  const line = warningText(warning({ reason: "a".repeat(300) })).split("\n")[1];
  assert.ok(line.startsWith(`${"a".repeat(99)}…`));
  assert.ok(line.length < 160);
});

test("warnlistView counts the active warnings in the header", () => {
  const view = warnlistView({
    user: USER,
    warnings: [warning(), warning({ id: "WARN-2", active: false })],
    page: 0,
    authorId: "mod",
  });
  assert.equal(view.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(view.allowedMentions, { parse: [] });
  assert.equal(texts(view)[0], "## Avertissements de kyo\n-# 1 actif sur 2");
  assert.equal(texts(view).length, 3);
});

test("warnlistView has no pager for a single page", () => {
  const view = warnlistView({
    user: USER,
    warnings: many(PAGE_SIZE),
    page: 0,
    authorId: "mod",
  });
  assert.equal(
    json(view).components.some((part) => part.type === 1),
    false,
  );
});

test("warnlistView shows ten warnings per page with a pager", () => {
  const first = warnlistView({
    user: USER,
    warnings: many(25),
    page: 0,
    authorId: "mod",
  });
  assert.equal(texts(first).length, 1 + PAGE_SIZE);
  assert.match(texts(first)[1], /WARN-0/);
  const [previous, label, next] = buttons(first);
  assert.equal(previous.disabled, true);
  assert.equal(label.label, "Page 1 / 3");
  assert.equal(next.disabled, false);
  assert.equal(next.custom_id, "warnlist:page:u:1:mod");

  const last = warnlistView({
    user: USER,
    warnings: many(25),
    page: 2,
    authorId: "mod",
  });
  assert.equal(texts(last).length, 1 + 5);
  const [back, , forward] = buttons(last);
  assert.equal(back.custom_id, "warnlist:page:u:1:mod");
  assert.equal(forward.disabled, true);
});

test("warnlistView clamps a page that no longer exists", () => {
  const view = warnlistView({
    user: USER,
    warnings: many(12),
    page: 9,
    authorId: "mod",
  });
  assert.equal(buttons(view)[1].label, "Page 2 / 2");
});

function setup({ userId = "mod", fetched = USER } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  insertWarning(db, {
    id: "WARN-7",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: Date.now() - DAY,
  });
  noteSanction(db, "WARN-7", "timeout", Date.now() + DAY);
  const calls = { replies: [], updates: [] };
  const bot = /** @type {any} */ ({
    users: {
      fetch: async () => (fetched === null ? Promise.reject() : fetched),
    },
  });
  const interaction = /** @type {any} */ ({
    user: { id: userId },
    guildId: "g",
    reply: async (payload) => calls.replies.push(payload),
    deferUpdate: async () => {},
    editReply: async (payload) => calls.updates.push(payload),
  });
  return {
    db,
    calls,
    run: (...params) => component.run(bot, interaction, params, db),
  };
}

test("warnlist component changes page for the author", async () => {
  const { calls, run } = setup();
  await run("page", "u", "0", "mod");
  assert.equal(calls.replies.length, 0);
  assert.match(JSON.stringify(calls.updates[0]), /WARN-7/);
  assert.match(JSON.stringify(calls.updates[0]), /Sourdine jusqu/);
});

test("warnlist component refuses someone else", async () => {
  const { calls, run } = setup({ userId: "other" });
  await run("page", "u", "0", "mod");
  assert.equal(calls.updates.length, 0);
  assert.match(calls.replies[0].content, /Seule la personne/);
});

test("warnlist component refuses an unknown action or page", async () => {
  const { calls, run } = setup();
  await run("nope", "u", "0", "mod");
  await run("page", "u", "x", "mod");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.replies.length, 2);
  assert.match(calls.replies[0].content, /plus actif/);
});

test("warnlist component refuses a member that cannot be fetched", async () => {
  const { calls, run } = setup({ fetched: null });
  await run("page", "u", "0", "mod");
  assert.equal(calls.updates.length, 0);
  assert.match(calls.replies[0].content, /introuvable/);
});
