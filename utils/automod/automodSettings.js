const { defineSettings } = require("../core/defineSettings");

const { get, update } = defineSettings("automod_settings", {
  logChannel: ["log_channel", "id"],
  spamEnabled: ["spam_enabled", "flag"],
  mentionsEnabled: ["mentions_enabled", "flag"],
  mentionLimit: ["mention_limit", "int"],
  observation: ["observation", "flag"],
  contestHours: ["contest_hours", "int"],
  escalationMinutes: ["escalation_minutes", "int"],
  reasonWords: ["reason_words", "text"],
  reasonSpam: ["reason_spam", "text"],
  reasonMentions: ["reason_mentions", "text"],
  warnValidDays: ["warn_valid_days", "int"],
  justiceCategory: ["justice_category", "id"],
  keepTranscript: ["keep_transcript", "flag"],
  muteType: ["mute_type", "text"],
  muteRole: ["mute_role", "id"],
});

module.exports = {
  getAutomodSettings: get,
  updateAutomodSettings: update,
};
