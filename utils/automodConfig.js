const transaction = require("./transaction");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("./automodSettings");
const { renderMainView } = require("./automodPanel");

const MAX_WORDS = 1000;
const MAX_WORD_LENGTH = 60;
const MAX_MENTION_LIMIT = 50;
const MAX_ESCALATION_WARNS = 20;
const MAX_ESCALATION_MINUTES = 40320;
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

function parseEscalation({ warns, minutes }) {
  const count = warns.trim();
  if (!/^\d+$/.test(count) || Number(count) > MAX_ESCALATION_WARNS)
    return {
      error: `Le nombre d'avertissements doit être un entier entre 0 et ${MAX_ESCALATION_WARNS}.`,
    };

  const duration = minutes.trim();
  if (
    !/^\d+$/.test(duration) ||
    Number(duration) < 1 ||
    Number(duration) > MAX_ESCALATION_MINUTES
  )
    return {
      error: `La durée doit être un entier entre 1 et ${MAX_ESCALATION_MINUTES} minutes.`,
    };

  return {
    escalation: {
      escalationWarns: Number(count),
      escalationMinutes: Number(duration),
    },
  };
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
  return "Discord a refusé cette configuration, les règles n'ont pas été appliquées.";
}

function mainView(interaction, db) {
  return renderMainView({
    settings: getAutomodSettings(db, interaction.guildId),
    words: getAutomodWords(db, interaction.guildId),
    exemptions: getExemptions(db, interaction.guildId),
    guild: interaction.guild,
  });
}

module.exports = {
  MAX_WORDS,
  MAX_WORD_LENGTH,
  MAX_MENTION_LIMIT,
  MAX_ESCALATION_WARNS,
  MAX_ESCALATION_MINUTES,
  parseWords,
  parseMentionLimit,
  parseEscalation,
  getAutomodWords,
  setAutomodWords,
  getExemptions,
  setExemptions,
  getAutomodConfig,
  toggleObservation,
  syncErrorMessage,
  mainView,
};
