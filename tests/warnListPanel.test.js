const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { MessageFlags } = require("discord.js");
const {
  insertWarning,
  noteSanction,
} = require("../utils/moderation/warnSanctions");
const {
  PAGE_SIZE,
  pageCount,
  clampPage,
  maskOf,
  pickWarnings,
  sanctionText,
  warningText,
  warnlistView,
  removalView,
  removedView,
  purgeView,
  purgedView,
} = require("../utils/moderation/warnlistPanel");
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

function rows(view) {
  return json(view).components.filter((part) => part.type === 1);
}

function buttons(view) {
  return rows(view).find((row) => row.components[0].type === 2).components;
}

function selectMenu(view) {
  return rows(view).find((row) => row.components[0].type === 3).components[0];
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
    buttons(view).some((button) => /^Page /.test(button.label)),
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

const { PermissionsBitField, PermissionFlagsBits } = require("discord.js");

const FUTURE = Date.now() + DAY;

test("warnlistView offers the warnings of the page in a multiple select", () => {
  const view = warnlistView({
    user: USER,
    warnings: many(12),
    page: 1,
    authorId: "mod",
  });
  const menu = selectMenu(view);
  assert.equal(menu.custom_id, "warnlist:select:u:1:mod");
  assert.equal(menu.min_values, 1);
  assert.equal(menu.max_values, 2);
  assert.deepEqual(
    menu.options.map((option) => [option.label, option.value]),
    [
      ["WARN-10", "0"],
      ["WARN-11", "1"],
    ],
  );
});

test("warnlistView has no select when there is nothing to remove", () => {
  const view = warnlistView({
    user: USER,
    warnings: [],
    page: 0,
    authorId: "mod",
  });
  assert.equal(
    rows(view).some((row) => row.components[0].type === 3),
    false,
  );
});

test("maskOf and pickWarnings find the chosen warnings of a page", () => {
  assert.equal(maskOf(["0", "2"]), 5);
  assert.deepEqual(
    pickWarnings(many(12), 0, 5).map((item) => item.id),
    ["WARN-0", "WARN-2"],
  );
  assert.deepEqual(
    pickWarnings(many(12), 1, 2).map((item) => item.id),
    ["WARN-11"],
  );
  assert.deepEqual(pickWarnings(many(3), 0, 0), []);
});

test("removalView names what will be removed and carries the choice", () => {
  const view = removalView({
    user: USER,
    selected: [warning(), warning({ id: "WARN-2" })],
    page: 0,
    mask: 5,
    total: 3,
    authorId: "mod",
  });
  assert.equal(view.flags, MessageFlags.IsComponentsV2);
  assert.equal(
    texts(view)[0],
    "## Retirer 2 avertissements ?\n-# WARN-1, WARN-2",
  );
  const [confirm, cancel] = buttons(view);
  assert.equal(confirm.custom_id, "warnlist:ok:u:0:mod:5:3");
  assert.equal(cancel.custom_id, "warnlist:page:u:0:mod");
});

test("removedView says what was lifted and warns about closed messages", () => {
  const done = removedView({
    user: USER,
    count: 1,
    lifted: ["timeout", "timeout"],
    delivered: true,
    page: 0,
    authorId: "mod",
  });
  assert.equal(
    texts(done)[0],
    "## 1 avertissement retiré\nPour kyo.\nSourdine levée.",
  );
  const closed = removedView({
    user: USER,
    count: 2,
    lifted: [],
    delivered: false,
    page: 0,
    authorId: "mod",
  });
  assert.match(texts(closed)[0], /^## 2 avertissements retirés/);
  assert.match(texts(closed)[0], /Messages privés fermés/);
  assert.equal(buttons(closed)[0].custom_id, "warnlist:page:u:0:mod");
});

function person(id, flags = [], position = 1, extra = {}) {
  return {
    id,
    guild: { ownerId: "owner" },
    permissions: new PermissionsBitField(flags),
    roles: {
      highest: {
        position,
        comparePositionTo(other) {
          return this.position - other.position;
        },
      },
    },
    communicationDisabledUntilTimestamp: FUTURE,
    ...extra,
  };
}

function setupRemoval({
  target = null,
  moderator = person("mod", [PermissionFlagsBits.ManageMessages], 5),
  dmOpen = true,
  values = ["0"],
  logs = null,
} = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  insertWarning(db, {
    id: "WARN-1",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Spam",
    date: Date.now() - DAY,
  });
  noteSanction(db, "WARN-1", "timeout", FUTURE);
  insertWarning(db, {
    id: "WARN-2",
    guildId: "g",
    userId: "u",
    authorId: "mod",
    reason: "Insultes",
    date: Date.now() - 2 * DAY,
  });
  const calls = { replies: [], updates: [], dms: [], timeouts: [] };
  const member =
    target ??
    person("u", [], 1, {
      timeout: async (...args) => calls.timeouts.push(args),
    });
  const bot = /** @type {any} */ ({
    users: {
      fetch: async () => ({
        ...USER,
        send: async (payload) => {
          if (!dmOpen) throw new Error("closed");
          calls.dms.push(JSON.stringify(payload));
        },
      }),
    },
  });
  const interaction = /** @type {any} */ ({
    user: { id: "mod", tag: "mod#0" },
    member: moderator,
    guildId: "g",
    guild: {
      id: "g",
      name: "Serveur",
      members: { fetch: async () => member },
      channels: { cache: new Map(logs === null ? [] : [["log", logs]]) },
    },
    values,
    isStringSelectMenu: () => true,
    reply: async (payload) => calls.replies.push(payload),
    deferUpdate: async () => {},
    editReply: async (payload) => calls.updates.push(JSON.stringify(payload)),
  });
  return {
    db,
    calls,
    run: (...params) => component.run(bot, interaction, params, db),
  };
}

function countWarns(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM warns").get().n;
}

test("choosing warnings asks for a confirmation and removes nothing", async () => {
  const { db, calls, run } = setupRemoval({ values: ["0", "1"] });
  await run("select", "u", "0", "mod");
  assert.equal(countWarns(db), 2);
  assert.match(calls.updates[0], /Retirer 2 avertissements/);
  assert.match(calls.updates[0], /warnlist:ok:u:0:mod:3:2/);
});

test("choosing nothing that exists is refused", async () => {
  const { calls, run } = setupRemoval({ values: [] });
  await run("select", "u", "0", "mod");
  assert.equal(calls.updates.length, 0);
  assert.match(calls.replies[0].content, /existent plus/);
});

test("confirming removes the warning, lifts the timeout and tells the member", async () => {
  const { db, calls, run } = setupRemoval();
  await run("ok", "u", "0", "mod", "1", "2");
  assert.equal(countWarns(db), 1);
  assert.deepEqual(calls.timeouts[0][0], null);
  assert.match(calls.dms[0], /Avertissement retiré sur Serveur/);
  assert.match(calls.dms[0], /Ta sourdine est levée/);
  assert.match(calls.updates[0], /1 avertissement retiré/);
  assert.match(calls.updates[0], /Sourdine levée/);
});

test("confirming two warnings removes both with one message", async () => {
  const { db, calls, run } = setupRemoval();
  await run("ok", "u", "0", "mod", "3", "2");
  assert.equal(countWarns(db), 0);
  assert.equal(calls.dms.length, 1);
  assert.match(calls.dms[0], /Avertissements retirés sur Serveur/);
  assert.match(calls.updates[0], /2 avertissements retirés/);
});

test("confirming keeps the removal when messages are closed", async () => {
  const { db, calls, run } = setupRemoval({ dmOpen: false });
  await run("ok", "u", "0", "mod", "1", "2");
  assert.equal(countWarns(db), 1);
  assert.match(calls.updates[0], /Messages privés fermés/);
});

test("confirming refuses a list that changed since the choice", async () => {
  const { db, calls, run } = setupRemoval();
  await run("ok", "u", "0", "mod", "1", "5");
  assert.equal(countWarns(db), 2);
  assert.equal(calls.updates.length, 0);
  assert.match(calls.replies[0].content, /La liste a changé/);
});

test("confirming refuses a member the moderator cannot moderate", async () => {
  const { db, calls, run } = setupRemoval({
    target: person("u", [PermissionFlagsBits.Administrator], 9),
  });
  await run("ok", "u", "0", "mod", "1", "2");
  assert.equal(countWarns(db), 2);
  assert.match(calls.replies[0].content, /ne peux pas modérer/);
});

test("warnlistView offers a purge button only when there is something to purge", () => {
  const full = warnlistView({
    user: USER,
    warnings: many(12),
    page: 1,
    authorId: "mod",
  });
  const purge = rows(full)
    .flatMap((row) => row.components)
    .find((button) => button.label === "Tout purger");
  assert.equal(purge.custom_id, "warnlist:purge:u:1:mod");
  const empty = warnlistView({
    user: USER,
    warnings: [],
    page: 0,
    authorId: "mod",
  });
  assert.equal(
    rows(empty).some((row) => row.components[0].type === 2),
    false,
  );
});

test("purgeView asks for a confirmation and carries the total", () => {
  const view = purgeView({ user: USER, total: 3, page: 1, authorId: "mod" });
  assert.equal(view.flags, MessageFlags.IsComponentsV2);
  assert.equal(texts(view)[0], "## Purger les 3 avertissements ?\n-# kyo");
  assert.match(texts(view)[1], /expirés compris/);
  assert.match(texts(view)[1], /expulsion/);
  const [confirm, cancel] = buttons(view);
  assert.equal(confirm.custom_id, "warnlist:purgeok:u:1:mod:0:3");
  assert.equal(cancel.custom_id, "warnlist:page:u:1:mod");
});

test("purgedView sums up the lifted sanctions and the kicks that stay", () => {
  const view = purgedView({
    user: USER,
    purged: [
      warning({ sanction: "kick" }),
      warning({ id: "WARN-2", sanction: "ban" }),
      warning({ id: "WARN-3", sanction: "kick" }),
    ],
    lifted: ["ban"],
    delivered: true,
    page: 0,
    authorId: "mod",
  });
  assert.equal(
    texts(view)[0],
    "## 3 avertissements purgés\nPour kyo.\nBannissement levé.\n2 expulsions déjà exécutées, non annulables.",
  );
  assert.equal(buttons(view)[0].custom_id, "warnlist:page:u:0:mod");
});

test("purgedView uses the singular and warns about closed messages", () => {
  const view = purgedView({
    user: USER,
    purged: [warning({ sanction: "kick" })],
    lifted: [],
    delivered: false,
    page: 0,
    authorId: "mod",
  });
  assert.match(texts(view)[0], /^## 1 avertissement purgé/);
  assert.match(texts(view)[0], /1 expulsion déjà exécutée, non annulable\./);
  assert.match(texts(view)[0], /Messages privés fermés/);
});

const ADMIN = () => person("mod", [PermissionFlagsBits.Administrator], 5);

test("asking for a purge shows the confirmation and removes nothing", async () => {
  const { db, calls, run } = setupRemoval({ moderator: ADMIN() });
  await run("purge", "u", "0", "mod");
  assert.equal(countWarns(db), 2);
  assert.match(calls.updates[0], /Purger les 2 avertissements/);
  assert.match(calls.updates[0], /warnlist:purgeok:u:0:mod:0:2/);
});

test("a purge needs the administrator permission", async () => {
  const { db, calls, run } = setupRemoval();
  await run("purge", "u", "0", "mod");
  await run("purgeok", "u", "0", "mod", "0", "2");
  assert.equal(countWarns(db), 2);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.replies.length, 2);
  assert.match(calls.replies[0].content, /administrateur/);
});

test("confirming a purge removes every warning with one message", async () => {
  const { db, calls, run } = setupRemoval({ moderator: ADMIN() });
  await run("purgeok", "u", "0", "mod", "0", "2");
  assert.equal(countWarns(db), 0);
  assert.deepEqual(calls.timeouts[0][0], null);
  assert.equal(calls.dms.length, 1);
  assert.match(calls.dms[0], /Avertissements retirés sur Serveur/);
  assert.match(calls.updates[0], /2 avertissements purgés/);
  assert.match(calls.updates[0], /Sourdine levée/);
});

test("confirming a purge refuses a list that changed", async () => {
  const { db, calls, run } = setupRemoval({ moderator: ADMIN() });
  await run("purgeok", "u", "0", "mod", "0", "5");
  assert.equal(countWarns(db), 2);
  assert.match(calls.replies[0].content, /La liste a changé/);
});

test("asking for a purge with nothing left is refused", async () => {
  const { db, calls, run } = setupRemoval({ moderator: ADMIN() });
  db.prepare("DELETE FROM warns").run();
  await run("purge", "u", "0", "mod");
  assert.equal(calls.updates.length, 0);
  assert.match(calls.replies[0].content, /existent plus/);
});

test("confirming a purge respects the hierarchy", async () => {
  const { db, calls, run } = setupRemoval({
    moderator: ADMIN(),
    target: person("u", [PermissionFlagsBits.Administrator], 9),
  });
  await run("purgeok", "u", "0", "mod", "0", "2");
  assert.equal(countWarns(db), 2);
  assert.match(calls.replies[0].content, /ne peux pas modérer/);
});

const { updateAutomodSettings } = require("../utils/automod/automodSettings");

function logChannel(sent) {
  return { isTextBased: () => true, send: async (m) => sent.push(m) };
}

test("removing warnings writes a line in the AutoMod log channel", async () => {
  const sent = [];
  const { db, run } = setupRemoval({ logs: logChannel(sent) });
  updateAutomodSettings(db, "g", { logChannel: "log" }, "mod");
  await run("ok", "u", "0", "mod", "3", "2");
  assert.equal(sent.length, 1);
  const text = JSON.stringify(sent[0]);
  assert.match(text, /Avertissements retirés/);
  assert.match(text, /WARN-1, WARN-2/);
});

test("a purge is logged as a purge", async () => {
  const sent = [];
  const { db, run } = setupRemoval({
    moderator: ADMIN(),
    logs: logChannel(sent),
  });
  updateAutomodSettings(db, "g", { logChannel: "log" }, "mod");
  await run("purgeok", "u", "0", "mod", "0", "2");
  assert.match(JSON.stringify(sent[0]), /Avertissements purgés/);
});

test("nothing is logged when no warning was removed", async () => {
  const sent = [];
  const { db, run } = setupRemoval({ logs: logChannel(sent) });
  updateAutomodSettings(db, "g", { logChannel: "log" }, "mod");
  await run("ok", "u", "0", "mod", "1", "5");
  assert.equal(sent.length, 0);
});
