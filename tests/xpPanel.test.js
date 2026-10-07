const test = require("node:test");
const assert = require("node:assert/strict");
const { ComponentType } = require("discord.js");
const {
  renderMainView,
  renderAnnounceView,
  renderMessageModal,
  renderGainsModal,
  renderBonusView,
  renderBonusTargetView,
  renderRewardsView,
  renderRewardView,
  renderRewardModal,
} = require("../utils/xpPanel");

const defaults = {
  announceMode: "current",
  announceChannel: null,
  announceMessage: "GG {membre}, tu passes niveau {niveau} !",
  xpMin: 10,
  xpMax: 20,
  cooldown: 60,
  updatedBy: null,
  updatedAt: null,
};

const noModifiers = { role: new Map(), channel: new Map() };

const guild = {
  name: "Tsuki",
  iconURL: () => "https://cdn.discordapp.com/icon.png",
};

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

function main(settings = defaults, options = {}) {
  return render(
    renderMainView({
      settings,
      modifiers: noModifiers,
      rewards: [],
      guild,
      viewer: "<@1>",
      rankedMembers: 12,
      ...options,
    }),
  );
}

test("main view shows every setting with a Modifier button", () => {
  const view = main();

  assert.match(view.text, /Serveur Tsuki · 12 membres classés/);
  assert.match(view.text, /Salon du message/);
  assert.match(view.text, /10 à 20 XP par message · toutes les 60 s/);
  assert.deepEqual(
    view.of(ComponentType.Button).map((b) => b.custom_id),
    [
      "xp-config:announce",
      "xp-config:message",
      "xp-config:gains",
      "xp-config:bonus",
      "xp-config:rewards",
    ],
  );
});

test("main view previews the real announcement", () => {
  assert.match(main().text, /> GG <@1>, tu passes niveau 5 !/);
});

test("main view shows the progression estimate", () => {
  assert.match(
    main().text,
    /Environ 15 XP par minute active · niveau 10 en 5 h/,
  );
});

test("main view shows who changed the settings last", () => {
  assert.match(main().text, /Réglages par défaut, jamais modifiés/);

  const changed = { ...defaults, updatedBy: "9", updatedAt: 1700000000000 };
  assert.match(
    main(changed).text,
    /Dernière modification par <@9> <t:1700000000:R>/,
  );
});

test("main view shows the dedicated channel", () => {
  const settings = {
    ...defaults,
    announceMode: "channel",
    announceChannel: "42",
  };
  assert.match(main(settings).text, /Salon dédié · <#42>/);
});

test("main view works without a server icon", () => {
  const view = render(
    renderMainView({
      settings: defaults,
      modifiers: noModifiers,
      rewards: [],
      guild: { name: "Tsuki", iconURL: () => null },
      viewer: "<@1>",
      rankedMembers: 0,
    }),
  );
  assert.equal(view.of(ComponentType.Thumbnail).length, 0);
});

test("announce view selects the current mode", () => {
  const select = render(renderAnnounceView({ settings: defaults })).of(
    ComponentType.StringSelect,
  )[0];
  const selected = select.options.filter((o) => o.default).map((o) => o.value);
  assert.deepEqual(selected, ["current"]);
});

test("announce view only asks for a channel in dedicated mode", () => {
  const hasChannelSelect = (settings) =>
    render(renderAnnounceView({ settings })).of(ComponentType.ChannelSelect)
      .length > 0;

  assert.equal(hasChannelSelect(defaults), false);
  assert.equal(
    hasChannelSelect({ ...defaults, announceMode: "channel" }),
    true,
  );
});

test("modals are prefilled with the current settings", () => {
  const message = render(renderMessageModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.equal(message[0].value, defaults.announceMessage);

  const gains = render(renderGainsModal({ settings: defaults })).of(
    ComponentType.TextInput,
  );
  assert.deepEqual(
    gains.map((i) => [i.custom_id, i.value]),
    [
      ["min", "10"],
      ["max", "20"],
      ["cooldown", "60"],
    ],
  );
});

const someModifiers = {
  role: new Map([
    ["booster", 1.5],
    ["muted", 0],
  ]),
  channel: new Map([["debates", 1.25]]),
};

test("main view summarises the bonuses", () => {
  assert.match(main().text, /Aucun bonus/);
  assert.match(
    main(defaults, { modifiers: someModifiers }).text,
    /2 rôles, 1 salon · dont 1 exclusion/,
  );
});

test("bonus view lists every bonus", () => {
  const view = render(renderBonusView({ modifiers: someModifiers }));

  assert.match(view.text, /<@&booster> · ×1,5/);
  assert.match(view.text, /<@&muted> · exclu/);
  assert.match(view.text, /<#debates> · ×1,25/);
  assert.equal(view.of(ComponentType.RoleSelect).length, 1);
  assert.equal(view.of(ComponentType.ChannelSelect).length, 1);
});

test("bonus view says when there is no bonus", () => {
  const view = render(renderBonusView({ modifiers: noModifiers }));
  assert.match(view.text, /Aucun bonus pour le moment/);
});

test("bonus target view preselects the current value", () => {
  const view = render(
    renderBonusTargetView({ type: "role", target: "booster", multiplier: 1.5 }),
  );
  const select = view.of(ComponentType.StringSelect)[0];

  assert.match(view.text, /Bonus pour <@&booster>\nActuellement ×1,5/);
  assert.equal(select.custom_id, "xp-config:bonus-set:role:booster");
  assert.deepEqual(
    select.options.filter((o) => o.default).map((o) => o.value),
    ["1.5"],
  );
});

const someRewards = [
  { level: 5, role: "regular" },
  { level: 10, role: "active" },
];

test("main view summarises the rewards", () => {
  assert.match(main().text, /Aucune récompense/);
  assert.match(
    main(defaults, { rewards: someRewards }).text,
    /2 rôles · niveaux 5 à 10/,
  );
  assert.match(
    main(defaults, { rewards: [someRewards[0]] }).text,
    /1 rôle · niveau 5/,
  );
});

test("rewards view lists every reward by level", () => {
  const view = render(renderRewardsView({ rewards: someRewards }));

  assert.match(view.text, /Niveau 5 · <@&regular>/);
  assert.match(view.text, /Niveau 10 · <@&active>/);
  assert.equal(view.of(ComponentType.RoleSelect).length, 1);
  assert.equal(
    view.of(ComponentType.RoleSelect)[0].custom_id,
    "xp-config:reward-role",
  );
});

test("rewards view says when there is no reward", () => {
  const view = render(renderRewardsView({ rewards: [] }));
  assert.match(view.text, /Aucune récompense pour le moment/);
});

test("reward view offers to change or remove the reward", () => {
  const view = render(renderRewardView({ role: "regular", level: 5 }));

  assert.match(view.text, /Récompense <@&regular>\nDonné au niveau 5/);
  assert.deepEqual(
    view.of(ComponentType.Button).map((b) => b.custom_id),
    [
      "xp-config:reward-level:regular",
      "xp-config:reward-remove:regular",
      "xp-config:rewards",
    ],
  );
});

test("reward modal asks for the level and is prefilled when known", () => {
  const field = (level) =>
    render(renderRewardModal({ role: "regular", level })).of(
      ComponentType.TextInput,
    )[0];

  assert.equal(field(null).custom_id, "level");
  assert.equal(field(null).value, undefined);
  assert.equal(field(7).value, "7");
});

test("main view previews the role of the preview level", () => {
  const settings = { ...defaults, announceMessage: "GG {membre} {role}" };

  assert.match(
    main(settings, { rewards: someRewards }).text,
    /> GG <@1> <@&regular>/,
  );
  assert.match(
    main(settings, { rewards: [{ level: 20, role: "veteran" }] }).text,
    /> GG <@1> <@&veteran>/,
  );
  assert.match(main(settings).text, /> GG <@1>$/m);
});
