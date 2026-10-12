const MAX_WINDOW = 60;
const MAX_CALM = 1440;
const MAX_JOINS = 200;
const MAX_ACCOUNT_DAYS = 365;
const MAX_TIMEOUT = 40320;

const SIGNAL_SETTINGS = {
  age: "signalAge",
  avatar: "signalAvatar",
  names: "signalNames",
  burst: "signalBurst",
  invite: "signalInvite",
};

const ACTION_SETTINGS = {
  watch: "watchAction",
  alert: "alertAction",
  raid: "raidAction",
};

function parseBounded(value, min, max, label, key) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max)
    return { error: `${label} doit être un entier entre ${min} et ${max}.` };
  return { [key]: Number(text) };
}

function parseRaidWindow(value) {
  return parseBounded(value, 1, MAX_WINDOW, "La fenêtre", "windowMinutes");
}

function parseRaidCalm(value) {
  return parseBounded(value, 1, MAX_CALM, "Le délai de calme", "calmMinutes");
}

function parseAccountDays(value) {
  return parseBounded(
    value,
    1,
    MAX_ACCOUNT_DAYS,
    "L'âge d'un compte récent",
    "accountDays",
  );
}

function parseTimeoutMinutes(value) {
  return parseBounded(
    value,
    1,
    MAX_TIMEOUT,
    "La durée de sourdine",
    "timeoutMinutes",
  );
}

function parseRaidThresholds(value) {
  const parts = String(value)
    .split(/[\s/,;]+/)
    .filter(Boolean);
  const error =
    "Les seuils sont trois entiers croissants entre 2 et 200, par exemple « 5 / 8 / 10 ».";
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part)))
    return { error };
  const [watchJoins, alertJoins, raidJoins] = parts.map(Number);
  if (
    watchJoins < 2 ||
    raidJoins > MAX_JOINS ||
    watchJoins > alertJoins ||
    alertJoins > raidJoins
  )
    return { error };
  return { watchJoins, alertJoins, raidJoins };
}

function parseRaidModal({ window, calm, thresholds, accountDays }) {
  const results = [
    parseRaidWindow(window),
    parseRaidCalm(calm),
    parseRaidThresholds(thresholds),
    parseAccountDays(accountDays),
  ];
  const failed = results.find((result) => result.error);
  if (failed) return failed;
  return Object.assign({}, ...results);
}

function toggleRaid(settings, logChannel) {
  if (!settings.enabled && logChannel === null)
    return {
      error:
        "Choisis d'abord un salon de logs dans les réglages AutoMod : c'est là que les alertes de raid sont envoyées.",
    };
  return { enabled: !settings.enabled };
}

function signalChanges(selected) {
  return Object.fromEntries(
    Object.entries(SIGNAL_SETTINGS).map(([signal, key]) => [
      key,
      selected.includes(signal),
    ]),
  );
}

function enabledSignals(settings) {
  return Object.entries(SIGNAL_SETTINGS)
    .filter(([, key]) => settings[key])
    .map(([signal]) => signal);
}

module.exports = {
  ACTION_SETTINGS,
  SIGNAL_SETTINGS,
  enabledSignals,
  parseAccountDays,
  parseRaidCalm,
  parseRaidModal,
  parseRaidThresholds,
  parseRaidWindow,
  parseTimeoutMinutes,
  signalChanges,
  toggleRaid,
};
