const { renderMainView } = require("./xpPanel");
const { getSettings } = require("./settings");
const { getModifiers } = require("./modifiers");
const { countRanked } = require("./xp");
const { getRewards } = require("./rewards");

const MAX_REWARD_LEVEL = 100;
const MAX_VOICE_XP = 1000;

const GAIN_FIELDS = [
  { key: "xpMin", field: "min", label: "L'XP minimum", max: 1000 },
  { key: "xpMax", field: "max", label: "L'XP maximum", max: 1000 },
  { key: "cooldown", field: "cooldown", label: "Le cooldown", max: 3600 },
];

function mainView(interaction, db) {
  return renderMainView({
    settings: getSettings(db, interaction.guildId),
    modifiers: getModifiers(db, interaction.guildId),
    rewards: getRewards(db, interaction.guildId),
    guild: interaction.guild,
    viewer: interaction.member,
    rankedMembers: countRanked(db, interaction.guildId),
  });
}

function parseGains(values) {
  const gains = {};

  for (const { key, field, label, max } of GAIN_FIELDS) {
    const value = values[field].trim();
    if (!/^\d+$/.test(value) || Number(value) > max)
      return {
        error: `${label} doit être un nombre entier entre 0 et ${max}.`,
      };
    gains[key] = Number(value);
  }

  if (gains.xpMin > gains.xpMax)
    return { error: "L'XP minimum ne peut pas dépasser l'XP maximum." };

  return { gains };
}

function parseVoiceGain(value) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) || Number(trimmed) > MAX_VOICE_XP)
    return {
      error: `Le gain doit être un nombre entier entre 0 et ${MAX_VOICE_XP}.`,
    };
  return { gain: Number(trimmed) };
}

function parseRewardLevel(value) {
  const trimmed = value.trim();
  if (
    !/^\d+$/.test(trimmed) ||
    Number(trimmed) < 1 ||
    Number(trimmed) > MAX_REWARD_LEVEL
  )
    return {
      error: `Le niveau doit être un nombre entier entre 1 et ${MAX_REWARD_LEVEL}.`,
    };
  return { level: Number(trimmed) };
}

function rewardRoleError(role, guildId) {
  if (!role) return "Ce rôle n'existe plus.";
  if (role.id === guildId)
    return "Le rôle @everyone ne peut pas être une récompense.";
  if (role.managed)
    return "Ce rôle est géré par une intégration, je ne peux pas le donner.";
  if (!role.editable)
    return "Ce rôle est au-dessus du mien, je ne pourrais pas le donner.";
  return null;
}

module.exports = {
  GAIN_FIELDS,
  MAX_REWARD_LEVEL,
  MAX_VOICE_XP,
  mainView,
  parseGains,
  parseVoiceGain,
  parseRewardLevel,
  rewardRoleError,
};
