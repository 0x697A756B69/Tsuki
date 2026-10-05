const { renderMainView } = require("./xpPanel");
const { getSettings } = require("./settings");
const { countRanked } = require("./xp");

const GAIN_FIELDS = [
  { key: "xpMin", field: "min", label: "L'XP minimum", max: 1000 },
  { key: "xpMax", field: "max", label: "L'XP maximum", max: 1000 },
  { key: "cooldown", field: "cooldown", label: "Le cooldown", max: 3600 },
];

function mainView(interaction, db) {
  return renderMainView({
    settings: getSettings(db, interaction.guildId),
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

module.exports = { GAIN_FIELDS, mainView, parseGains };
