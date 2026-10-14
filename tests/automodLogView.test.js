const test = require("node:test");
const assert = require("node:assert/strict");
const { ButtonStyle, MessageFlags } = require("discord.js");
const { RULE_NAMES } = require("../utils/automod/automodRules");
const {
  ACTION_ID,
  EXCERPT_LENGTH,
  RETENTION,
  logTitle,
  excerpt,
  buildLogMessage,
  markResolved,
} = require("../utils/automod/automodLogView");

function data(changes = {}) {
  return {
    ruleKey: "words",
    ruleName: RULE_NAMES.words,
    userId: "u",
    channelId: "c",
    warningTotal: 2,
    content: "gros mot",
    date: 1_000_000,
    ...changes,
  };
}

function render(changes) {
  return JSON.stringify(buildLogMessage(data(changes)).components[0].toJSON());
}

test("logTitle names the blocked rule", () => {
  assert.equal(logTitle("words"), "Message bloqué : mot interdit");
  assert.equal(logTitle("mentions"), "Message bloqué : mentions de masse");
});

test("logTitle says detected instead of blocked in observation", () => {
  assert.equal(logTitle("spam", true), "Message détecté : spam");
});

test("excerpt keeps a short text as one line", () => {
  assert.equal(excerpt("  un  \n mot  "), "un mot");
});

test("excerpt cuts at 200 characters", () => {
  const result = excerpt("a".repeat(500));
  assert.equal(result.length, EXCERPT_LENGTH);
  assert.ok(result.endsWith("…"));
  assert.equal(excerpt("a".repeat(EXCERPT_LENGTH)).length, EXCERPT_LENGTH);
});

test("excerpt is null without text", () => {
  assert.equal(excerpt(""), null);
  assert.equal(excerpt("  \n "), null);
  assert.equal(excerpt(undefined), null);
});

test("buildLogMessage is a silent components v2 panel", () => {
  const message = buildLogMessage(data());
  assert.equal(message.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.equal(message.components.length, 1);
});

test("buildLogMessage shows member, channel, rule, action and quote", () => {
  const json = render();
  assert.match(json, /Message bloqué : mot interdit/);
  assert.match(json, /<@u>/);
  assert.match(json, /<#c>/);
  assert.match(json, new RegExp(RULE_NAMES.words));
  assert.match(json, /bloqué, avertissement ajouté \(2 actifs\)/);
  assert.match(json, /> gros mot/);
});

test("buildLogMessage links the message only when it exists", () => {
  assert.doesNotMatch(render(), /Aller au message/);
  assert.match(
    render({ messageUrl: "https://discord.com/channels/g/c/m" }),
    /\[Aller au message\]\(https:\/\/discord\.com\/channels\/g\/c\/m\)/,
  );
});

test("buildLogMessage skips the quote when there is no text", () => {
  assert.doesNotMatch(render({ content: "" }), /> /);
});

test("buildLogMessage announces the purge date 30 days later", () => {
  const expected = Math.floor((1_000_000 + RETENTION) / 1000);
  assert.match(render(), new RegExp(`<t:${expected}:D>`));
});

function buttons(changes) {
  const container = buildLogMessage(data(changes)).components[0].toJSON();
  const row = container.components.find((part) => part.type === 1);
  return row ? /** @type {any[]} */ (row.components) : [];
}

test("a blocked log offers remove, timeout, ban and close", () => {
  const row = buttons({ warningId: "WARN-1" });
  assert.deepEqual(
    row.map((button) => button.custom_id),
    [
      `${ACTION_ID}:remove:u:WARN-1`,
      `${ACTION_ID}:timeout:u`,
      `${ACTION_ID}:ban:u`,
      `${ACTION_ID}:close`,
    ],
  );
  assert.deepEqual(
    row.map((button) => button.label),
    ["Retirer l'avertissement", "Mettre en sourdine", "Bannir", "Classer"],
  );
  assert.equal(row[2].style, ButtonStyle.Danger);
});

test("a blocked log without a warning cannot remove one", () => {
  const ids = buttons().map((button) => button.custom_id);
  assert.equal(
    ids.some((id) => id.includes(":remove:")),
    false,
  );
  assert.equal(ids.length, 3);
});

test("an observed log offers delete, warn and close", () => {
  const row = buttons({ observed: true, messageId: "m" });
  assert.deepEqual(
    row.map((button) => button.custom_id),
    [`${ACTION_ID}:delete:c:m`, `${ACTION_ID}:warn:u`, `${ACTION_ID}:close`],
  );
  assert.deepEqual(
    row.map((button) => button.label),
    ["Supprimer le message", "Avertir", "Classer"],
  );
});

test("an observed log without a message cannot delete it", () => {
  const ids = buttons({ observed: true }).map((button) => button.custom_id);
  assert.deepEqual(ids, [`${ACTION_ID}:warn:u`, `${ACTION_ID}:close`]);
});

test("a handled log loses its buttons and shows who handled it", () => {
  const resolved = {
    moderatorId: "mod",
    label: "avertissement retiré",
    date: 2_000_000,
  };
  assert.deepEqual(buttons({ resolved }), []);
  const json = render({ resolved });
  assert.match(json, /Traité par <@mod> : avertissement retiré, le <t:2000:f>/);
  assert.match(json, /Supprimé de ce salon le/);
  assert.match(json, new RegExp(String(0x8e8e93)));
});

test("markResolved turns a live panel into the handled one", () => {
  const resolved = { moderatorId: "mod", label: "classé", date: 2_000_000 };
  const live = buildLogMessage(data({ warningId: "WARN-1" })).components[0];
  const handled = markResolved(live.toJSON(), resolved);
  const expected = buildLogMessage(data({ resolved }));
  assert.equal(handled.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(handled.allowedMentions, { parse: [] });
  assert.deepEqual(handled.components[0], expected.components[0].toJSON());
});

test("an observed message is logged in yellow without sanction", () => {
  const json = render({
    observed: true,
    messageUrl: "https://discord.com/channels/g/c/m",
  });
  assert.match(json, /Message détecté : mot interdit/);
  assert.match(json, /observation, aucune sanction/);
  assert.match(json, /Aller au message/);
  assert.doesNotMatch(json, /avertissement ajouté/);
  assert.notEqual(
    buildLogMessage(data({ observed: true })).components[0].toJSON()
      .accent_color,
    buildLogMessage(data()).components[0].toJSON().accent_color,
  );
});
