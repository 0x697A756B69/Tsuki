const PROFILES = {
  calm: {
    label: "Tranquille",
    description:
      "Sourdine à 10 points, points divisés par deux tous les 2 jours",
    settings: {
      sensitivity: 10,
      halfLifeDays: 2,
      pointsWords: 1,
      pointsSpam: 1,
      pointsMentions: 2,
    },
  },
  standard: {
    label: "Standard",
    description:
      "Sourdine à 6 points, points divisés par deux tous les 3 jours",
    settings: {
      sensitivity: 6,
      halfLifeDays: 3,
      pointsWords: 2,
      pointsSpam: 1,
      pointsMentions: 3,
    },
  },
  strict: {
    label: "Strict",
    description:
      "Sourdine à 3 points, points divisés par deux tous les 5 jours",
    settings: {
      sensitivity: 3,
      halfLifeDays: 5,
      pointsWords: 3,
      pointsSpam: 2,
      pointsMentions: 4,
    },
  },
};

const CUSTOM_LABEL = "Personnalisé";

function profileSettings(key) {
  return Object.hasOwn(PROFILES, key) ? { ...PROFILES[key].settings } : null;
}

function currentProfile(settings) {
  const found = Object.keys(PROFILES).find((key) =>
    Object.entries(PROFILES[key].settings).every(
      ([name, value]) => settings[name] === value,
    ),
  );
  return found ?? null;
}

function profileLabel(settings) {
  const key = currentProfile(settings);
  return key === null ? CUSTOM_LABEL : PROFILES[key].label;
}

module.exports = {
  PROFILES,
  CUSTOM_LABEL,
  profileSettings,
  currentProfile,
  profileLabel,
};
