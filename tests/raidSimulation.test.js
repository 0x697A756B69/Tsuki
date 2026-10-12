const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SPACING_SECONDS,
  formatSimulation,
  simulateRaid,
} = require("../utils/raidSimulation");

function settings(changes = {}) {
  return {
    windowMinutes: 10,
    calmMinutes: 10,
    watchJoins: 3,
    alertJoins: 5,
    raidJoins: 7,
    scope: "suspect",
    observation: false,
    watchAction: "log",
    alertAction: "timeout",
    raidAction: "ban",
    lockdown: "off",
    ...changes,
  };
}

test("simulateRaid sends two accounts more than the raid threshold", () => {
  const result = simulateRaid(settings());

  assert.equal(result.total, 9);
  assert.equal(result.spacingSeconds, SPACING_SECONDS);
});

test("simulateRaid goes up one tier at each threshold", () => {
  const result = simulateRaid(settings());

  assert.deepEqual(
    result.events.map(({ join, tier, count }) => [join, tier, count]),
    [
      [3, "watch", 3],
      [5, "alert", 5],
      [7, "raid", 7],
    ],
  );
  assert.equal(result.reached, true);
});

test("simulateRaid reports the action of each tier", () => {
  const result = simulateRaid(settings());

  assert.deepEqual(
    result.events.map((event) => event.action),
    ["log", "timeout", "ban"],
  );
});

test("simulateRaid plans the lockdown only at the raid tier", () => {
  const result = simulateRaid(settings({ lockdown: "invites" }));

  assert.deepEqual(
    result.events.map((event) => event.lockdown),
    [null, null, "invites"],
  );
});

test("simulateRaid counts every simulated account whatever the scope", () => {
  const all = simulateRaid(settings({ scope: "all" }));
  const suspect = simulateRaid(settings({ scope: "suspect" }));

  assert.deepEqual(all.events, suspect.events);
});

test("simulateRaid says the raid is not reached when joins leave the window", () => {
  const result = simulateRaid(settings({ windowMinutes: 1 }), {
    spacingSeconds: 30,
  });

  assert.equal(result.reached, false);
});

test("simulateRaid gives the time before the calm returns", () => {
  const result = simulateRaid(settings({ windowMinutes: 10, calmMinutes: 15 }));

  assert.equal(result.calmAfterMinutes, 25);
});

test("simulateRaid does not read or change the settings", () => {
  const input = settings();
  const copy = structuredClone(input);
  simulateRaid(input);

  assert.deepEqual(input, copy);
});

test("formatSimulation lists each tier with its action", () => {
  const config = settings({ lockdown: "invites" });
  const text = formatSimulation(simulateRaid(config), config);

  assert.match(text, /Rien n'est appliqué ni enregistré/);
  assert.match(text, /Vigilance.*n°3.*journal seul/);
  assert.match(text, /Alerte.*n°5.*mis en sourdine/);
  assert.match(text, /Raid probable.*n°7.*banni.*invitations en pause/);
  assert.match(text, /Retour au calme 20 minutes/);
});

test("formatSimulation tells that observation applies nothing", () => {
  const config = settings({ observation: true });
  const text = formatSimulation(simulateRaid(config), config);

  assert.match(text, /banni \(observation : rien d'appliqué\)/);
});

test("formatSimulation warns when the raid tier is out of reach", () => {
  const config = settings({ windowMinutes: 1 });
  const text = formatSimulation(
    simulateRaid(config, { spacingSeconds: 30 }),
    config,
  );

  assert.match(text, /Le palier Raid n'est pas atteint/);
});
