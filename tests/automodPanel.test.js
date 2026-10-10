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
  renderSensitivityModal,
  renderPointsModal,
  renderContestModal,
} = require("../utils/automodPanel");

const defaults = {
  logChannel: null,
  spamEnabled: false,
  mentionsEnabled: false,
  mentionLimit: 5,
  observation: false,
  contestHours: 168,
  escalationMinutes: 60,
  sensitivity: 6,
  halfLifeDays: 3,
  pointsWords: 2,
  pointsSpam: 1,
  pointsMentions: 3,
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
    "Sensibilité",
    "Points par règle",
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
      "automod-config:sensitivity",
      "automod-config:points",
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
  assert.match(view.text, /Sourdine de 1 h quand le score atteint le seuil/);
  assert.match(view.text, /Fenêtre de 7 j/);
  assert.match(
    view.text,
    /Sourdine à 6 points · points divisés par deux tous les 3 jours/,
  );
  assert.match(view.text, /Mots 2 · Spam 1 · Mentions 3/);
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
      logChannel: "42",
    },
    [],
    { roles: ["r1", "r2"], channels: ["c1"] },
  );

  assert.match(view.text, /Activé/);
  assert.match(view.text, /Activées/);
  assert.match(view.text, /2 rôles, 1 salon/);
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
    [["minutes", "60"]],
  );
});

test("the modals post to the automod component", () => {
  for (const [modal, action] of [
    [renderWordsModal({ words: [] }), "save-words"],
    [renderMentionLimitModal({ settings: defaults }), "save-mention-limit"],
    [renderEscalationModal({ settings: defaults }), "save-escalation"],
    [renderSensitivityModal({ settings: defaults }), "save-sensitivity"],
    [renderPointsModal({ settings: defaults }), "save-points"],
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

test("main view describes the sensitivity", () => {
  assert.match(
    main({ ...defaults, sensitivity: 1, halfLifeDays: 1 }).text,
    /Sensibilité\*\*\nSourdine à 1 point · points divisés par deux tous les 1 jour\b/,
  );
  assert.match(
    main({ ...defaults, sensitivity: 0 }).text,
    /Sensibilité\*\*\nDésactivée/,
  );
});

test("main view lists the points of every rule", () => {
  assert.match(
    main({ ...defaults, pointsWords: 5, pointsSpam: 4, pointsMentions: 9 })
      .text,
    /Points par règle\*\*\nMots 5 · Spam 4 · Mentions 9/,
  );
});

test("the sensitivity modal asks for the threshold and the half-life", () => {
  const fields = render(renderSensitivityModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    fields.map((i) => [i.custom_id, i.value]),
    [
      ["threshold", "6"],
      ["halfLife", "3"],
    ],
  );
});

test("the points modal asks for the points of every rule", () => {
  const fields = render(renderPointsModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    fields.map((i) => [i.custom_id, i.value]),
    [
      ["words", "2"],
      ["spam", "1"],
      ["mentions", "3"],
    ],
  );
});

test("main view offers the three profiles in a select", () => {
  const selects = main().of(ComponentType.StringSelect);
  assert.equal(selects.length, 1);
  assert.equal(selects[0].custom_id, "automod-config:profile");
  assert.deepEqual(
    selects[0].options.map((option) => option.value),
    ["calm", "standard", "strict"],
  );
});

test("main view marks the profile matching the settings", () => {
  const view = main();
  const [select] = view.of(ComponentType.StringSelect);
  assert.match(select.placeholder, /Standard/);
  assert.deepEqual(
    select.options.filter((option) => option.default).map((o) => o.value),
    ["standard"],
  );
});

test("main view says Personnalisé when no profile matches", () => {
  const view = main({ ...defaults, sensitivity: 8 });
  const [select] = view.of(ComponentType.StringSelect);
  assert.match(select.placeholder, /Personnalisé/);
  assert.equal(
    select.options.some((option) => option.default),
    false,
  );
});

test("main view stays within the 40 components Discord allows", () => {
  assert.ok(main().all.length <= 40);
  assert.ok(
    main({ ...defaults, logChannel: "42", observation: true }, ["a", "b"], {
      roles: ["r"],
      channels: ["c"],
    }).all.length <= 40,
  );
});
