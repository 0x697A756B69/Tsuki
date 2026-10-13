const { defineSettings } = require("./defineSettings");

const { get, update } = defineSettings("guild_settings", {
  announceMode: ["announce_mode", "text"],
  announceChannel: ["announce_channel", "id"],
  announceMessage: ["announce_message", "text"],
  xpMin: ["xp_min", "int"],
  xpMax: ["xp_max", "int"],
  cooldown: ["cooldown", "int"],
  voiceEnabled: ["voice_enabled", "flag"],
  voiceXp: ["voice_xp", "int"],
  cardAccent: ["card_accent", "id"],
});

module.exports = { getSettings: get, updateSettings: update };
