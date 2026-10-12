const COLUMNS = {
  enabled: "enabled",
  observation: "observation",
  scope: "scope",
  windowMinutes: "window_minutes",
  calmMinutes: "calm_minutes",
  watchJoins: "watch_joins",
  alertJoins: "alert_joins",
  raidJoins: "raid_joins",
  accountDays: "account_days",
  signalAge: "signal_age",
  signalAvatar: "signal_avatar",
  signalNames: "signal_names",
  signalBurst: "signal_burst",
  signalInvite: "signal_invite",
  watchAction: "watch_action",
  alertAction: "alert_action",
  raidAction: "raid_action",
  timeoutMinutes: "timeout_minutes",
  quarantineRole: "quarantine_role",
  lockdown: "lockdown",
};

function toSettings(row) {
  return {
    enabled: Number(row.enabled) === 1,
    observation: Number(row.observation) === 1,
    scope: String(row.scope),
    windowMinutes: Number(row.window_minutes),
    calmMinutes: Number(row.calm_minutes),
    watchJoins: Number(row.watch_joins),
    alertJoins: Number(row.alert_joins),
    raidJoins: Number(row.raid_joins),
    accountDays: Number(row.account_days),
    signalAge: Number(row.signal_age) === 1,
    signalAvatar: Number(row.signal_avatar) === 1,
    signalNames: Number(row.signal_names) === 1,
    signalBurst: Number(row.signal_burst) === 1,
    signalInvite: Number(row.signal_invite) === 1,
    watchAction: String(row.watch_action),
    alertAction: String(row.alert_action),
    raidAction: String(row.raid_action),
    timeoutMinutes: Number(row.timeout_minutes),
    quarantineRole:
      row.quarantine_role === null ? null : String(row.quarantine_role),
    lockdown: String(row.lockdown),
    updatedBy: row.updated_by === null ? null : String(row.updated_by),
    updatedAt: row.updated_at === null ? null : Number(row.updated_at),
  };
}

function getRaidSettings(db, guildId) {
  const select = db.prepare("SELECT * FROM raid_settings WHERE guild = ?");
  let row = select.get(guildId);
  if (!row) {
    db.prepare("INSERT INTO raid_settings (guild) VALUES (?)").run(guildId);
    row = select.get(guildId);
  }
  return toSettings(row);
}

function updateRaidSettings(db, guildId, changes, authorId, date = Date.now()) {
  const entries = Object.entries(changes);
  for (const [key] of entries)
    if (!(key in COLUMNS)) throw new TypeError(`Unknown setting: ${key}`);

  getRaidSettings(db, guildId);
  const assignments = [
    ...entries.map(([key]) => `${COLUMNS[key]} = ?`),
    "updated_by = ?",
    "updated_at = ?",
  ].join(", ");
  db.prepare(`UPDATE raid_settings SET ${assignments} WHERE guild = ?`).run(
    ...entries.map(([key, value]) =>
      typeof value === "boolean" ? Number(value) : value,
    ),
    authorId,
    date,
    guildId,
  );
  return getRaidSettings(db, guildId);
}

module.exports = { getRaidSettings, updateRaidSettings };
