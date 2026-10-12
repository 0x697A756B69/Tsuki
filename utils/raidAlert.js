const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { getAutomodSettings } = require("./automodSettings");
const { SIGNAL_LABELS, isSuspect } = require("./joinSignals");
const { getRaidSettings } = require("./raidSettings");
const { refreshRaid } = require("./raidWatch");

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

function buildRaidAlert({
  tier,
  count,
  windowMinutes,
  members = [],
  observed = false,
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

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        `-# ${observed ? "Observation : rien n'a été appliqué" : "Aucune sanction n'a été appliquée"} · <t:${Math.floor(date / 1000)}:f>`,
      ),
    );

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

function announceRaid(bot, guild, settings, { evaluation, recent }, date) {
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
    date,
  });
}

async function sweepRaids(bot, now = Date.now()) {
  let changes = 0;
  for (const [guildId, entry] of bot.raidMemory ?? []) {
    if (entry.state === null || entry.state.tier === "calm") continue;
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) continue;
    const settings = getRaidSettings(bot.db, guildId);
    if (!settings.enabled) continue;
    const result = refreshRaid(bot.db, bot.raidMemory, guildId, settings, now);
    if (!result.evaluation.changed) continue;
    changes += 1;
    await announceRaid(bot, guild, settings, result, now);
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
