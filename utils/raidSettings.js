const { defineSettings } = require("./defineSettings");

const { get, update } = defineSettings("raid_settings", {
  enabled: ["enabled", "flag"],
  observation: ["observation", "flag"],
  scope: ["scope", "text"],
  windowMinutes: ["window_minutes", "int"],
  calmMinutes: ["calm_minutes", "int"],
  watchJoins: ["watch_joins", "int"],
  alertJoins: ["alert_joins", "int"],
  raidJoins: ["raid_joins", "int"],
  accountDays: ["account_days", "int"],
  signalAge: ["signal_age", "flag"],
  signalAvatar: ["signal_avatar", "flag"],
  signalNames: ["signal_names", "flag"],
  signalBurst: ["signal_burst", "flag"],
  signalInvite: ["signal_invite", "flag"],
  watchAction: ["watch_action", "text"],
  alertAction: ["alert_action", "text"],
  raidAction: ["raid_action", "text"],
  timeoutMinutes: ["timeout_minutes", "int"],
  quarantineRole: ["quarantine_role", "id"],
  lockdown: ["lockdown", "text"],
});

module.exports = { getRaidSettings: get, updateRaidSettings: update };
