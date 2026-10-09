const test = require("node:test");
const assert = require("node:assert/strict");
const { ComponentType } = require("discord.js");
const {
  renderMainView,
  renderExemptionsView,
  renderLogsView,
  renderWordsModal,
  renderMentionLimitModal,
  renderEscalationModal,
  renderContestModal,
} = require("../utils/automodPanel");

const defaults = {
  logChannel: null,
  spamEnabled: false,
  mentionsEnabled: false,
  mentionLimit: 5,
  observation: false,
  contestHours: 168,
  escalationWarns: 3,
  escalationMinutes: 60,
  updatedBy: null,
  updatedAt: null,
};

const noExemptions = { roles: [], channels: [] };
const guild = { name: "Tsuki" };

function flatten(component) {
  const children = [
    ...(component.components ?? []),
    ...(component.accessory ? [component.accessory] : []),
    ...(component.component ? [component.component] : []),
  ];
  return [component, ...children.flatMap(flatten)];
}

function render(view) {
  const json =
    "toJSON" in view
      ? view.toJSON()
      : view.components.map((c) => c.toJSON())[0];
  const all = flatten(json);
  return {
    all,
    text: all.map((c) => c.content ?? "").join("\n"),
    of: (type) => all.filter((c) => c.type === type),
  };
}

function main(settings = defaults, words = [], exemptions = noExemptions) {
  return render(renderMainView({ settings, words, exemptions, guild }));
}

test("main view shows every setting with a button", () => {
  const view = main();

  for (const title of [
    "Mots interdits",
    "Spam",
    "Mentions de masse",
    "Limite de mentions",
    "Exemptions",
    "Escalade",
    "Contestation",
    "Logs",
    "Mode observation",
  ])
    assert.match(view.text, new RegExp(title));
  assert.deepEqual(
    view.of(ComponentType.Button).map((b) => b.custom_id),
    [
      "automod-config:words",
      "automod-config:spam-toggle",
      "automod-config:mentions-toggle",
      "automod-config:mention-limit",
      "automod-config:exemptions",
      "automod-config:escalation",
      "automod-config:contest",
      "automod-config:logs",
      "automod-config:observation-toggle",
    ],
  );
});

test("main view describes the defaults", () => {
  const view = main();

  assert.match(view.text, /Aucun mot interdit/);
  assert.match(view.text, /Désactivé/);
  assert.match(view.text, /5 mentions par message/);
  assert.match(view.text, /Aucune exemption/);
  assert.match(view.text, /Timeout de 1 h à 3 avertissements/);
  assert.match(view.text, /Fenêtre de 7 j/);
  assert.match(view.text, /Aucun salon/);
  assert.match(view.text, /jamais modifiés/);
});

test("main view summarises the words, with a preview", () => {
  assert.match(main(defaults, ["a", "b"]).text, /2 mots · a, b/);
  assert.match(main(defaults, ["a"]).text, /1 mot · a/);
  assert.match(
    main(defaults, ["a", "b", "c", "d", "e", "f", "g"]).text,
    /7 mots · a, b, c, d, e et 2 autres/,
  );
});

test("main view reflects the toggles, the exemptions and the logs", () => {
  const view = main(
    {
      ...defaults,
      spamEnabled: true,
      mentionsEnabled: true,
      escalationWarns: 0,
      logChannel: "42",
    },
    [],
    { roles: ["r1", "r2"], channels: ["c1"] },
  );

  assert.match(view.text, /Activé/);
  assert.match(view.text, /Activées/);
  assert.match(view.text, /2 rôles, 1 salon/);
  assert.match(view.text, /Désactivée/);
  assert.match(view.text, /<#42>/);
  const labels = view.of(ComponentType.Button).map((b) => b.label);
  assert.equal(labels.filter((label) => label === "Désactiver").length, 2);
});

test("main view shows who changed the settings last", () => {
  const view = main({ ...defaults, updatedBy: "7", updatedAt: 1700000000000 });

  assert.match(view.text, /<@7> <t:1700000000:R>/);
});

test("exemptions view preselects the current exemptions", () => {
  const view = render(
    renderExemptionsView({
      exemptions: { roles: ["r1", "r2"], channels: ["c1"] },
    }),
  );
  const [roles] = view.of(ComponentType.RoleSelect);
  const [channels] = view.of(ComponentType.ChannelSelect);

  assert.equal(roles.custom_id, "automod-config:exempt-roles");
  assert.deepEqual(
    roles.default_values.map((v) => v.id),
    ["r1", "r2"],
  );
  assert.equal(roles.min_values, 0);
  assert.equal(channels.custom_id, "automod-config:exempt-channels");
  assert.deepEqual(
    channels.default_values.map((v) => v.id),
    ["c1"],
  );
  assert.equal(channels.min_values, 0);
  assert.ok(
    view.of(ComponentType.Button).some((b) => b.custom_id.endsWith(":back")),
  );
});

test("logs view lets you pick a text channel or remove it", () => {
  const empty = render(renderLogsView({ settings: defaults }));
  const [select] = empty.of(ComponentType.ChannelSelect);
  const clear = (view) =>
    view
      .of(ComponentType.Button)
      .find((b) => b.custom_id.endsWith(":logs-clear"));

  assert.equal(select.custom_id, "automod-config:log-channel");
  assert.match(empty.text, /Aucun salon/);
  assert.equal(clear(empty).disabled, true);

  const set = render(
    renderLogsView({ settings: { ...defaults, logChannel: "42" } }),
  );
  assert.match(set.text, /<#42>/);
  assert.ok(!clear(set).disabled);
});

test("the modals start with the current values", () => {
  const words = render(renderWordsModal({ words: ["foo", "bar"] })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    words.map((i) => [i.custom_id, i.value, i.required]),
    [["words", "foo\nbar", false]],
  );

  const limit = render(renderMentionLimitModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    limit.map((i) => [i.custom_id, i.value]),
    [["limit", "5"]],
  );

  const escalation = render(renderEscalationModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    escalation.map((i) => [i.custom_id, i.value]),
    [
      ["warns", "3"],
      ["minutes", "60"],
    ],
  );
});

test("the modals post to the automod component", () => {
  for (const [modal, action] of [
    [renderWordsModal({ words: [] }), "save-words"],
    [renderMentionLimitModal({ settings: defaults }), "save-mention-limit"],
    [renderEscalationModal({ settings: defaults }), "save-escalation"],
    [renderContestModal({ settings: defaults }), "save-contest"],
  ])
    assert.equal(render(modal).all[0].custom_id, `automod-config:${action}`);
});

test("main view shows the observation mode", () => {
  const off = main({ ...defaults, logChannel: "42" });
  assert.match(off.text, /Mode observation\*\*\nDésactivé/);
  const on = main({ ...defaults, logChannel: "42", observation: true });
  assert.match(
    on.text,
    /Mode observation\*\*\nActivé : rien n'est bloqué ni sanctionné/,
  );
  const toggle = (view) =>
    view
      .of(ComponentType.Button)
      .find((b) => b.custom_id === "automod-config:observation-toggle");
  assert.equal(toggle(off).label, "Activer");
  assert.equal(toggle(on).label, "Désactiver");
});

test("main view describes the contest window", () => {
  assert.match(
    main({ ...defaults, contestHours: 12 }).text,
    /Contestation\*\*\nFenêtre de 12 h/,
  );
  assert.match(
    main({ ...defaults, contestHours: 0 }).text,
    /Contestation\*\*\nDésactivée/,
  );
});

test("the contest modal asks for the window in hours", () => {
  const fields = render(renderContestModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    fields.map((i) => [i.custom_id, i.value]),
    [["hours", "168"]],
  );
});
