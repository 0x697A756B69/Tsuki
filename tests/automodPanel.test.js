const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType, ComponentType } = require("discord.js");
const { DEFAULT_LADDER } = require("../utils/warnLadder");
const { DEFAULT_REASONS } = require("../utils/warnReasons");
const {
  HOME_SECTIONS,
  describeLadder,
  renderMainView,
  renderRulesView,
  renderReasonsView,
  renderLadderView,
  renderValidityView,
  renderContestView,
  renderJusticeView,
  renderObservationView,
  renderExemptionsView,
  renderLogsView,
  renderWordsModal,
  renderMentionLimitModal,
  renderContestModal,
  renderReasonsModal,
  renderLadderModal,
  renderValidityModal,
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
  reasonWords: "Insultes",
  reasonSpam: "Spam",
  reasonMentions: "Mentions de masse",
  warnValidDays: 30,
  justiceCategory: null,
  keepTranscript: false,
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

function main(settings = defaults) {
  return render(renderMainView({ settings, guild }));
}

function rules(settings = defaults, words = []) {
  return render(renderRulesView({ settings, words }));
}

const buttonIds = (view) =>
  view.of(ComponentType.Button).map((b) => b.custom_id);

test("main view is a welcome page with a three-sentence wiki", () => {
  const view = main();

  assert.match(view.text, /AutoMod — réglages\nServeur Tsuki/);
  assert.match(view.text, /\*\*Blocage\*\*/);
  assert.match(view.text, /\*\*Paliers\*\*/);
  assert.match(view.text, /\*\*Contestation\*\*/);
  assert.match(view.text, /jamais modifiés/);
});

test("main view offers one menu to go to every setting", () => {
  const view = main();
  const [select] = view.of(ComponentType.StringSelect);

  assert.equal(view.of(ComponentType.StringSelect).length, 1);
  assert.equal(select.custom_id, "automod-config:goto");
  assert.equal(select.placeholder, "Aller à un réglage…");
  assert.deepEqual(
    select.options.map((option) => option.value),
    [
      "rules",
      "reasons",
      "ladder",
      "validity",
      "contest",
      "justice",
      "logs",
      "observation",
      "exemptions",
    ],
  );
  assert.deepEqual(
    HOME_SECTIONS,
    select.options.map(({ label, value, description }) => ({
      label,
      value,
      description,
    })),
  );
  assert.equal(view.of(ComponentType.Button).length, 0);
});

test("main view drops the profile, the escalation and the score settings", () => {
  const view = main();

  for (const word of ["Profil", "Escalade", "Sensibilité", "Points par règle"])
    assert.doesNotMatch(view.text, new RegExp(word));
  assert.ok(
    !view
      .of(ComponentType.StringSelect)
      .some((select) => select.custom_id.endsWith(":profile")),
  );
});

test("main view shows who changed the settings last", () => {
  const view = main({ ...defaults, updatedBy: "7", updatedAt: 1700000000000 });

  assert.match(view.text, /<@7> <t:1700000000:R>/);
});

test("rules view shows every rule with a button", () => {
  const view = rules();

  for (const title of [
    "Mots interdits",
    "Spam",
    "Mentions de masse",
    "Limite de mentions",
  ])
    assert.match(view.text, new RegExp(title));
  assert.deepEqual(buttonIds(view), [
    "automod-config:words",
    "automod-config:spam-toggle",
    "automod-config:mentions-toggle",
    "automod-config:mention-limit",
    "automod-config:back",
  ]);
});

test("rules view describes the defaults", () => {
  const view = rules();

  assert.match(view.text, /Aucun mot interdit/);
  assert.match(view.text, /Désactivé/);
  assert.match(view.text, /5 mentions par message/);
});

test("rules view summarises the words, with a preview", () => {
  assert.match(rules(defaults, ["a", "b"]).text, /2 mots · a, b/);
  assert.match(rules(defaults, ["a"]).text, /1 mot · a/);
  assert.match(
    rules(defaults, ["a", "b", "c", "d", "e", "f", "g"]).text,
    /7 mots · a, b, c, d, e et 2 autres/,
  );
});

test("rules view reflects the toggles", () => {
  const view = rules({ ...defaults, spamEnabled: true, mentionsEnabled: true });

  assert.match(view.text, /Activé/);
  assert.match(view.text, /Activées/);
  const labels = view.of(ComponentType.Button).map((b) => b.label);
  assert.equal(labels.filter((label) => label === "Désactiver").length, 2);
});

test("reasons view lists the reasons and one menu per rule", () => {
  const view = render(
    renderReasonsView({ settings: defaults, reasons: DEFAULT_REASONS }),
  );
  const selects = view.of(ComponentType.StringSelect);

  assert.match(view.text, /Insultes · Spam · Publicité/);
  assert.deepEqual(
    selects.map((select) => select.custom_id),
    [
      "automod-config:reason-words",
      "automod-config:reason-spam",
      "automod-config:reason-mentions",
    ],
  );
  assert.deepEqual(
    selects.map((select) => select.placeholder),
    [
      "Mots interdits : Insultes",
      "Spam : Spam",
      "Mentions de masse : Mentions de masse",
    ],
  );
  assert.deepEqual(
    selects[0].options.map((option) => option.value),
    DEFAULT_REASONS,
  );
  assert.deepEqual(
    selects[1].options.filter((option) => option.default).map((o) => o.value),
    ["Spam"],
  );
  assert.deepEqual(buttonIds(view), [
    "automod-config:reasons-edit",
    "automod-config:reasons-reset",
    "automod-config:back",
  ]);
});

test("reasons view stays valid with 24 long reasons", () => {
  const reasons = Array.from({ length: 24 }, (_, i) =>
    `Raison ${i} `.padEnd(50, "x"),
  );
  const view = render(renderReasonsView({ settings: defaults, reasons }));

  assert.ok(view.all.length <= 40);
  assert.equal(view.of(ComponentType.StringSelect)[0].options.length, 24);
});

test("describeLadder lists the steps and marks the last as open-ended", () => {
  assert.equal(
    describeLadder(DEFAULT_LADDER),
    [
      "1 avertissement : aucune sanction",
      "2 avertissements : sourdine de 10 min",
      "3 avertissements : sourdine de 1 h",
      "4 avertissements et plus : sourdine de 1 j",
    ].join("\n"),
  );
  assert.equal(
    describeLadder([{ warns: 1, sanction: "ban", minutes: null }]),
    "1 avertissement et plus : bannissement",
  );
});

test("ladder view shows the ladder with edit and reset buttons", () => {
  const view = render(renderLadderView({ ladder: DEFAULT_LADDER }));

  assert.match(view.text, /## Paliers/);
  assert.match(view.text, /2 avertissements : sourdine de 10 min/);
  assert.deepEqual(buttonIds(view), [
    "automod-config:ladder-edit",
    "automod-config:ladder-reset",
    "automod-config:back",
  ]);
});

test("validity view says how long a warning counts", () => {
  const view = render(renderValidityView({ settings: defaults }));
  assert.match(view.text, /compte pendant 30 j/);
  assert.deepEqual(buttonIds(view), [
    "automod-config:validity",
    "automod-config:back",
  ]);

  const never = render(
    renderValidityView({ settings: { ...defaults, warnValidDays: 0 } }),
  );
  assert.match(never.text, /n'expirent jamais/);
});

test("contest view describes the window", () => {
  const view = (contestHours) =>
    render(renderContestView({ settings: { ...defaults, contestHours } }));

  assert.match(view(12).text, /Fenêtre de 12 h/);
  assert.match(view(0).text, /Désactivée/);
  assert.deepEqual(buttonIds(view(12)), [
    "automod-config:contest",
    "automod-config:back",
  ]);
});

test("observation view toggles the mode", () => {
  const view = (observation) =>
    render(renderObservationView({ settings: { ...defaults, observation } }));
  const toggle = (rendered) =>
    rendered
      .of(ComponentType.Button)
      .find((b) => b.custom_id === "automod-config:observation-toggle");

  assert.match(view(false).text, /Désactivé/);
  assert.equal(toggle(view(false)).label, "Activer");
  assert.match(view(true).text, /Activé/);
  assert.equal(toggle(view(true)).label, "Désactiver");
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

test("justice view lets you pick a category, remove it and keep the discussion", () => {
  const empty = render(renderJusticeView({ settings: defaults }));
  const [select] = empty.of(ComponentType.ChannelSelect);
  const button = (view, action) =>
    view
      .of(ComponentType.Button)
      .find((b) => b.custom_id === `automod-config:${action}`);

  assert.equal(select.custom_id, "automod-config:justice-category");
  assert.deepEqual(select.channel_types, [ChannelType.GuildCategory]);
  assert.match(empty.text, /Aucune catégorie/);
  assert.equal(button(empty, "justice-clear").disabled, true);
  assert.equal(button(empty, "transcript-toggle").label, "Activer");
  assert.match(empty.text, /disparaît avec le salon/);

  const set = render(
    renderJusticeView({
      settings: { ...defaults, justiceCategory: "42", keepTranscript: true },
    }),
  );
  assert.match(set.text, /<#42>/);
  assert.ok(!button(set, "justice-clear").disabled);
  assert.equal(button(set, "transcript-toggle").label, "Désactiver");
  assert.match(set.text, /fichier de la conversation/);
});

test("the modals start with the current values", () => {
  const input = (modal) => render(modal).of(ComponentType.TextInput);

  assert.deepEqual(
    input(renderWordsModal({ words: ["foo", "bar"] })).map((i) => [
      i.custom_id,
      i.value,
      i.required,
    ]),
    [["words", "foo\nbar", false]],
  );
  assert.deepEqual(
    input(renderMentionLimitModal({ settings: defaults })).map((i) => [
      i.custom_id,
      i.value,
    ]),
    [["limit", "5"]],
  );
  assert.deepEqual(
    input(renderContestModal({ settings: defaults })).map((i) => [
      i.custom_id,
      i.value,
    ]),
    [["hours", "168"]],
  );
  assert.deepEqual(
    input(renderValidityModal({ settings: defaults })).map((i) => [
      i.custom_id,
      i.value,
    ]),
    [["days", "30"]],
  );
  assert.deepEqual(
    input(renderReasonsModal({ reasons: ["Spam", "Pub"] })).map((i) => [
      i.custom_id,
      i.value,
    ]),
    [["reasons", "Spam\nPub"]],
  );
  assert.deepEqual(
    input(renderLadderModal({ lines: "aucune\nsourdine 10 min" })).map((i) => [
      i.custom_id,
      i.value,
    ]),
    [["ladder", "aucune\nsourdine 10 min"]],
  );
});

test("the modals post to the automod component", () => {
  for (const [modal, action] of [
    [renderWordsModal({ words: [] }), "save-words"],
    [renderMentionLimitModal({ settings: defaults }), "save-mention-limit"],
    [renderContestModal({ settings: defaults }), "save-contest"],
    [renderValidityModal({ settings: defaults }), "save-validity"],
    [renderReasonsModal({ reasons: ["Spam"] }), "save-reasons"],
    [renderLadderModal({ lines: "aucune" }), "save-ladder"],
  ])
    assert.equal(render(modal).all[0].custom_id, `automod-config:${action}`);
});

test("every view stays within the 40 components Discord allows", () => {
  const words = ["a", "b", "c", "d", "e", "f", "g"];
  const busy = { ...defaults, spamEnabled: true, logChannel: "42" };
  const views = [
    main(busy),
    rules(busy, words),
    render(renderReasonsView({ settings: busy, reasons: DEFAULT_REASONS })),
    render(renderLadderView({ ladder: DEFAULT_LADDER })),
    render(renderValidityView({ settings: busy })),
    render(renderContestView({ settings: busy })),
    render(renderJusticeView({ settings: busy })),
    render(renderObservationView({ settings: busy })),
    render(
      renderExemptionsView({ exemptions: { roles: ["r"], channels: ["c"] } }),
    ),
    render(renderLogsView({ settings: busy })),
  ];
  for (const view of views) assert.ok(view.all.length <= 40);
});

test("every section view brings back to the welcome page", () => {
  const views = [
    rules(),
    render(renderReasonsView({ settings: defaults, reasons: DEFAULT_REASONS })),
    render(renderLadderView({ ladder: DEFAULT_LADDER })),
    render(renderValidityView({ settings: defaults })),
    render(renderContestView({ settings: defaults })),
    render(renderJusticeView({ settings: defaults })),
    render(renderObservationView({ settings: defaults })),
    render(renderExemptionsView({ exemptions: noExemptions })),
    render(renderLogsView({ settings: defaults })),
  ];
  for (const view of views) {
    const back = view
      .of(ComponentType.Button)
      .find((b) => b.custom_id === "automod-config:back");
    assert.equal(back.label, "Retour à l'accueil");
  }
});
