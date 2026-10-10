const transaction = require("./transaction");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("./automodSettings");
const { validateLadder, formatDuration } = require("./warnLadder");
const {
  cleanReasons,
  getReasons,
  MAX_REASONS,
  MAX_LENGTH,
} = require("./warnReasons");
const { getLadder } = require("./warnLadder");
const panel = require("./automodPanel");

const MAX_WORDS = 1000;
const MAX_WORD_LENGTH = 60;
const MAX_MENTION_LIMIT = 50;
const MAX_CONTEST_HOURS = 720;
const MAX_VALID_DAYS = 365;
const UNITS = { min: 1, m: 1, h: 60, j: 1440 };
const EXEMPTION_KINDS = ["role", "channel"];

function parseWords(value) {
  const words = [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (words.length > MAX_WORDS)
    return { error: `Il y a trop de mots : ${MAX_WORDS} au maximum.` };
  if (words.some((word) => word.length > MAX_WORD_LENGTH))
    return {
      error: `Un mot ne peut pas dépasser ${MAX_WORD_LENGTH} caractères.`,
    };
  return { words };
}

function parseMentionLimit(value) {
  const trimmed = value.trim();
  if (
    !/^\d+$/.test(trimmed) ||
    Number(trimmed) < 1 ||
    Number(trimmed) > MAX_MENTION_LIMIT
  )
    return {
      error: `La limite doit être un nombre entier entre 1 et ${MAX_MENTION_LIMIT}.`,
    };
  return { limit: Number(trimmed) };
}

function parseContest(value) {
  const hours = value.trim();
  if (!/^\d+$/.test(hours) || Number(hours) > MAX_CONTEST_HOURS)
    return {
      error: `La durée doit être un entier entre 0 et ${MAX_CONTEST_HOURS} heures.`,
    };
  return { contestHours: Number(hours) };
}

function parseValidity(value) {
  const days = value.trim();
  if (!/^\d+$/.test(days) || Number(days) > MAX_VALID_DAYS)
    return {
      error: `La durée doit être un entier entre 0 et ${MAX_VALID_DAYS} jours.`,
    };
  return { warnValidDays: Number(days) };
}

function parseReasons(value) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.some((line) => line.length > MAX_LENGTH))
    return {
      error: `Une raison ne peut pas dépasser ${MAX_LENGTH} caractères.`,
    };
  const reasons = cleanReasons(lines);
  if (reasons.length === 0) return { error: "Garde au moins une raison." };
  if (new Set(lines.map((line) => line.toLowerCase())).size > MAX_REASONS)
    return { error: `Il y a trop de raisons : ${MAX_REASONS} au maximum.` };
  return { reasons };
}

function parseStep(line, warns) {
  const text = line.trim().toLowerCase();
  if (text === "aucune" || text === "rien" || text === "aucune sanction")
    return { warns, sanction: null, minutes: null };
  if (text === "expulsion" || text === "kick")
    return { warns, sanction: "kick", minutes: null };
  if (text === "bannissement" || text === "ban")
    return { warns, sanction: "ban", minutes: null };
  const match = /^sourdine\s+(\d+)\s*(min|m|h|j)$/.exec(text);
  if (!match) return null;
  return {
    warns,
    sanction: "timeout",
    minutes: Number(match[1]) * UNITS[match[2]],
  };
}

function parseLadder(value) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const steps = [];
  for (const [index, line] of lines.entries()) {
    const step = parseStep(line, index + 1);
    if (!step)
      return { error: `Ligne ${index + 1} : « ${line} » n'est pas reconnue.` };
    steps.push(step);
  }
  try {
    validateLadder(steps);
  } catch (error) {
    if (steps.length === 0 || steps.length > 10)
      return { error: "Il faut entre 1 et 10 lignes." };
    return { error: "Une sourdine dure de 1 minute à 28 jours." };
  }
  return { ladder: steps };
}

function ladderLines(ladder) {
  return ladder
    .map((step) => {
      if (step.sanction === null) return "aucune";
      if (step.sanction === "kick") return "expulsion";
      if (step.sanction === "ban") return "bannissement";
      return `sourdine ${formatDuration(step.minutes)}`;
    })
    .join("\n");
}

function getAutomodWords(db, guildId) {
  return db
    .prepare("SELECT word FROM automod_words WHERE guild = ? ORDER BY word")
    .all(guildId)
    .map((row) => String(row.word));
}

function setAutomodWords(db, guildId, words, authorId) {
  transaction(db, () => {
    db.prepare("DELETE FROM automod_words WHERE guild = ?").run(guildId);
    const insert = db.prepare(
      "INSERT INTO automod_words (guild, word) VALUES (?, ?)",
    );
    for (const word of words) insert.run(guildId, word);
    updateAutomodSettings(db, guildId, {}, authorId);
  });
}

function getExemptions(db, guildId) {
  const rows = db
    .prepare(
      "SELECT kind, target FROM automod_exemptions WHERE guild = ? ORDER BY target",
    )
    .all(guildId);
  const targets = (kind) =>
    rows.filter((row) => row.kind === kind).map((row) => String(row.target));
  return { roles: targets("role"), channels: targets("channel") };
}

function setExemptions(db, guildId, kind, targets, authorId) {
  if (!EXEMPTION_KINDS.includes(kind))
    throw new TypeError(`Unknown exemption kind: ${kind}`);

  transaction(db, () => {
    db.prepare(
      "DELETE FROM automod_exemptions WHERE guild = ? AND kind = ?",
    ).run(guildId, kind);
    const insert = db.prepare(
      "INSERT INTO automod_exemptions (guild, kind, target) VALUES (?, ?, ?)",
    );
    for (const target of new Set(targets)) insert.run(guildId, kind, target);
    updateAutomodSettings(db, guildId, {}, authorId);
  });
}

function getAutomodConfig(db, guildId) {
  const settings = getAutomodSettings(db, guildId);
  const exemptions = getExemptions(db, guildId);
  return {
    words: getAutomodWords(db, guildId),
    spam: settings.spamEnabled,
    mentions: settings.mentionsEnabled,
    mentionLimit: settings.mentionLimit,
    exemptRoles: exemptions.roles,
    exemptChannels: exemptions.channels,
    logChannel: settings.logChannel,
    observation: settings.observation,
  };
}

function toggleObservation(settings) {
  if (settings.observation) return { observation: false };
  if (settings.logChannel === null)
    return {
      error:
        "Choisis d'abord un salon de logs : le mode observation y signale les messages au lieu de les bloquer.",
    };
  return { observation: true };
}

function syncErrorMessage(error) {
  if (error?.code === 50013)
    return "Il me manque la permission « Gérer le serveur » pour créer les règles AutoMod.";
  if (error?.code === 30032)
    return "Ce serveur a atteint la limite de règles AutoMod de Discord.";
  const detail = error?.message
    ? ` Détail : ${error.message}`.slice(0, 300)
    : "";
  return `Discord a refusé cette configuration, les règles n'ont pas été appliquées.${detail}`;
}

function mainView(interaction, db) {
  return panel.renderMainView({
    settings: getAutomodSettings(db, interaction.guildId),
    guild: interaction.guild,
  });
}

function sectionView(name, interaction, db) {
  const { guildId } = interaction;
  const settings = getAutomodSettings(db, guildId);
  const views = {
    rules: () =>
      panel.renderRulesView({ settings, words: getAutomodWords(db, guildId) }),
    reasons: () =>
      panel.renderReasonsView({ settings, reasons: getReasons(db, guildId) }),
    ladder: () => panel.renderLadderView({ ladder: getLadder(db, guildId) }),
    validity: () => panel.renderValidityView({ settings }),
    contest: () => panel.renderContestView({ settings }),
    justice: () => panel.renderJusticeView({ settings }),
    logs: () => panel.renderLogsView({ settings }),
    observation: () => panel.renderObservationView({ settings }),
    exemptions: () =>
      panel.renderExemptionsView({ exemptions: getExemptions(db, guildId) }),
  };
  return name in views ? views[name]() : null;
}

module.exports = {
  MAX_WORDS,
  MAX_WORD_LENGTH,
  MAX_MENTION_LIMIT,
  MAX_CONTEST_HOURS,
  parseWords,
  parseMentionLimit,
  parseContest,
  parseValidity,
  parseReasons,
  parseLadder,
  ladderLines,
  getAutomodWords,
  setAutomodWords,
  getExemptions,
  setExemptions,
  getAutomodConfig,
  toggleObservation,
  syncErrorMessage,
  mainView,
  sectionView,
};
