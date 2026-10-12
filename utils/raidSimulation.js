const { evaluateRaid, MINUTE } = require("./raidDetector");
const { MODE_LABELS } = require("./raidLockdown");
const { ACTION_LABELS, actionFor } = require("./raidResponse");
const { TITLES } = require("./raidAlert");

const SPACING_SECONDS = 20;
const SUSPECT_SIGNALS = ["age", "avatar"];

function simulateRaid(settings, { spacingSeconds = SPACING_SECONDS } = {}) {
  const total = settings.raidJoins + 2;
  const start = 0;
  const joins = [];
  const events = [];
  let state = null;

  for (let index = 1; index <= total; index += 1) {
    const now = start + index * spacingSeconds * 1000;
    joins.push({
      user: `sim${index}`,
      joinedAt: now,
      signals: SUSPECT_SIGNALS,
    });
    const evaluation = evaluateRaid({
      joins,
      settings: { ...settings, scope: "all" },
      previous: state,
      now,
    });
    state = { tier: evaluation.tier, heldAt: evaluation.heldAt };
    if (evaluation.changed)
      events.push({
        join: index,
        tier: evaluation.tier,
        count: evaluation.count,
        action: actionFor(settings, evaluation.tier),
        lockdown:
          evaluation.tier === "raid" && settings.lockdown !== "off"
            ? settings.lockdown
            : null,
      });
  }

  const last = start + total * spacingSeconds * 1000;
  const calmAt =
    last + (settings.windowMinutes + settings.calmMinutes) * MINUTE;
  const calm = evaluateRaid({
    joins: [],
    settings: { ...settings, scope: "all" },
    previous: state,
    now: calmAt,
  });
  const reached = events.some((event) => event.tier === "raid");

  return {
    total,
    spacingSeconds,
    events,
    reached,
    calmAfterMinutes:
      calm.tier === "calm"
        ? settings.windowMinutes + settings.calmMinutes
        : null,
  };
}

function describeAction(action, observation) {
  if (action === "log") return "journal seul";
  return observation
    ? `${ACTION_LABELS[action]} (observation : rien d'appliqué)`
    : ACTION_LABELS[action];
}

function formatSimulation(result, settings) {
  const lines = [
    `**Simulation** : ${result.total} comptes suspects arrivent, un toutes les ${result.spacingSeconds} secondes. Rien n'est appliqué ni enregistré.`,
  ];
  for (const event of result.events) {
    const lockdown = event.lockdown
      ? ` · verrouillage : ${MODE_LABELS[event.lockdown]}`
      : "";
    lines.push(
      `• ${TITLES[event.tier]} à l'arrivée n°${event.join} (${event.count} dans la fenêtre) → ${describeAction(event.action, settings.observation)}${lockdown}`,
    );
  }
  if (!result.reached)
    lines.push(
      "Le palier Raid n'est pas atteint avec ces seuils et cette fenêtre : les arrivées simulées sortent de la fenêtre avant.",
    );
  if (result.calmAfterMinutes !== null)
    lines.push(
      `Retour au calme ${result.calmAfterMinutes} minutes après la dernière arrivée.`,
    );
  return lines.join("\n");
}

module.exports = { SPACING_SECONDS, formatSimulation, simulateRaid };
