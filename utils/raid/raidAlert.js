const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { getAutomodSettings } = require("../automodSettings");
const { SIGNAL_LABELS, isSuspect } = require("./joinSignals");
const { buildRaidButtons } = require("./raidButtons");
const { getRaidSettings } = require("./raidSettings");
const { MODE_LABELS, getLockdown, syncLockdown } = require("./raidLockdown");
const { ACTION_LABELS } = require("./raidResponse");
const { refreshRaid } = require("./raidWatch");
const { KINDS, summarizeCauses } = require("../core/failure");

const TITLES = {
  calm: "Retour au calme",
  watch: "Vigilance : arrivées inhabituelles",
  alert: "Alerte : afflux de nouveaux membres",
  raid: "Raid probable",
};
const COLORS = {
  calm: 0x8e8e93,
  watch: 0xf5a524,
  alert: 0xf76808,
  raid: 0xe5484d,
};
const MAX_LISTED = 10;

function memberLine({ user, signals }) {
  const labels = signals.map((signal) => SIGNAL_LABELS[signal]);
  return `<@${user}> · ${labels.length === 0 ? "aucun signal" : labels.join(", ")}`;
}

function countLabel(count) {
  return `${count} membre${count > 1 ? "s" : ""}`;
}

function responseLines(response) {
  if (!response || response.action === "log") return [];
  const label = ACTION_LABELS[response.action];
  const lines = [];
  if (response.observed && response.planned.length > 0)
    lines.push(
      `**Aurait été appliqué :** ${label} · ${countLabel(response.planned.length)}`,
    );
  if (response.done.length > 0)
    lines.push(`**Appliqué :** ${label} · ${countLabel(response.done.length)}`);
  if (response.failed.length > 0)
    lines.push(
      `**Échec :** ${countLabel(response.failed.length)} (${summarizeCauses(response.causes ?? []) || KINDS.permissions})`,
    );
  return lines;
}

function lockdownLine(lockdown) {
  if (!lockdown) return [];
  const label = MODE_LABELS[lockdown.mode];
  if (!lockdown.ok)
    return [
      lockdown.action === "engage"
        ? `**Échec du verrouillage :** ${label}`
        : "**Échec de la levée :** nouvelle tentative au prochain contrôle",
    ];
  if (lockdown.action === "release")
    return ["**Verrouillage levé :** état d'avant restauré"];
  return [
    `**${lockdown.observed ? "Aurait été verrouillé" : "Verrouillage"} :** ${label}`,
  ];
}

function buildRaidAlert({
  tier,
  count,
  windowMinutes,
  members = [],
  observed = false,
  response = null,
  lockdown = null,
  date = Date.now(),
}) {
  const text = (value) => new TextDisplayBuilder().setContent(value);
  const container = new ContainerBuilder()
    .setAccentColor(COLORS[tier])
    .addTextDisplayComponents(text(`## ${TITLES[tier]}`));

  if (tier === "calm") {
    container.addTextDisplayComponents(
      text("Les arrivées sont revenues à un rythme normal."),
    );
  } else {
    container.addTextDisplayComponents(
      text(
        `**Arrivées :** ${count} en ${windowMinutes} minute${windowMinutes > 1 ? "s" : ""}`,
      ),
    );
    if (members.length > 0) {
      const listed = members.slice(0, MAX_LISTED).map(memberLine);
      const hidden = members.length - listed.length;
      if (hidden > 0)
        listed.push(`… et ${hidden} autre${hidden > 1 ? "s" : ""}`);
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(text(listed.join("\n")));
    }
  }

  const lines = [...responseLines(response), ...lockdownLine(lockdown)];
  if (lines.length > 0)
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(text(lines.join("\n")));

  const applied = response !== null && response.done.length > 0;
  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        `-# ${observed ? "Observation : rien n'a été appliqué" : applied ? "Sanctions appliquées automatiquement" : "Aucune sanction n'a été appliquée"} · <t:${Math.floor(date / 1000)}:f>`,
      ),
    );

  if (tier !== "calm") container.addActionRowComponents(buildRaidButtons());

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function sendRaidAlert(guild, channelId, data) {
  if (channelId === null) return null;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return null;
  return channel.send(buildRaidAlert(data)).catch(() => null);
}

function announceRaid(
  bot,
  guild,
  settings,
  { evaluation, recent },
  date,
  response = null,
  lockdown = null,
) {
  const { logChannel } = getAutomodSettings(bot.db, guild.id);
  const members = recent
    .filter((join) => settings.scope === "all" || isSuspect(join.signals))
    .map(({ user, signals }) => ({ user, signals }));
  return sendRaidAlert(guild, logChannel, {
    tier: evaluation.tier,
    count: evaluation.count,
    windowMinutes: settings.windowMinutes,
    members,
    observed: settings.observation,
    response,
    lockdown,
    date,
  });
}

async function sweepRaids(bot, now = Date.now()) {
  let changes = 0;
  for (const [guildId, entry] of bot.raidMemory ?? []) {
    const idle = entry.state === null || entry.state.tier === "calm";
    if (idle && getLockdown(bot.db, guildId) === null) continue;
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) continue;
    const settings = getRaidSettings(bot.db, guildId);
    if (!settings.enabled) continue;
    const result = refreshRaid(bot.db, bot.raidMemory, guildId, settings, now);
    const lockdown = await syncLockdown(
      bot.db,
      guild,
      settings,
      result.evaluation.tier,
      now,
    );
    if (!result.evaluation.changed) continue;
    changes += 1;
    await announceRaid(bot, guild, settings, result, now, null, lockdown);
  }
  return changes;
}

module.exports = {
  MAX_LISTED,
  TITLES,
  announceRaid,
  buildRaidAlert,
  sendRaidAlert,
  sweepRaids,
};
