const DAY = 24 * 60 * 60 * 1000;
const BURST_WINDOW = 60 * 60 * 1000;
const GROUP_SIZE = 2;
const MIN_NAME_LENGTH = 3;
const SUSPECT_SIGNALS = 2;

const SIGNAL_LABELS = {
  age: "Compte récent",
  avatar: "Sans avatar",
  names: "Noms jumeaux",
  burst: "Créations groupées",
  invite: "Même invitation",
};

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^\p{L}]/gu, "");
}

function getJoinSignals(member, recent, settings) {
  const others = recent.filter((join) => join.user !== member.user);
  const signals = [];

  if (
    settings.signalAge &&
    member.joinedAt - member.createdAt < settings.accountDays * DAY
  )
    signals.push("age");

  if (settings.signalAvatar && !member.hasAvatar) signals.push("avatar");

  const shape = normalizeName(member.name);
  if (
    settings.signalNames &&
    shape.length >= MIN_NAME_LENGTH &&
    others.some((join) => normalizeName(join.name) === shape)
  )
    signals.push("names");

  if (
    settings.signalBurst &&
    others.filter(
      (join) => Math.abs(join.createdAt - member.createdAt) <= BURST_WINDOW,
    ).length >= GROUP_SIZE
  )
    signals.push("burst");

  if (
    settings.signalInvite &&
    member.invite != null &&
    others.filter((join) => join.invite === member.invite).length >= GROUP_SIZE
  )
    signals.push("invite");

  return signals;
}

function isSuspect(signals) {
  return signals.length >= SUSPECT_SIGNALS;
}

module.exports = {
  BURST_WINDOW,
  GROUP_SIZE,
  MIN_NAME_LENGTH,
  SIGNAL_LABELS,
  SUSPECT_SIGNALS,
  getJoinSignals,
  isSuspect,
  normalizeName,
};
