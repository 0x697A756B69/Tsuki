const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { buildCustomId } = require("./customId");
const { getSettings } = require("./settings");
const { getTopMembers, getTopChannels, getActivity } = require("./leaderboard");

const PERIODS = [
  { value: "global", label: "Global" },
  { value: "month", label: "Mois" },
  { value: "week", label: "Semaine" },
];
const TYPES = [
  { value: "messages", label: "Messages" },
  { value: "voice", label: "Vocal" },
];
const SIDE_ROWS = 3;
const UNKNOWN_MEMBER = "Ancien membre";
const UNKNOWN_CHANNEL = "#salon-supprimé";

function isPeriod(value) {
  return PERIODS.some((period) => period.value === value);
}

function isType(value) {
  return TYPES.some((type) => type.value === value);
}

function getLeaderboardData(
  db,
  guildId,
  { type, period, voiceEnabled, date = new Date() },
) {
  const effectiveType = voiceEnabled ? type : "messages";
  const toIds = (rows) => rows.map(({ user, value }) => ({ id: user, value }));
  return {
    type: effectiveType,
    period,
    members: toIds(getTopMembers(db, guildId, effectiveType, period, date)),
    activity: getActivity(db, guildId, effectiveType, date),
    channels: getTopChannels(db, guildId, period, date, SIDE_ROWS).map(
      ({ channel, value }) => ({ id: channel, value }),
    ),
    voice: voiceEnabled
      ? toIds(getTopMembers(db, guildId, "voice", period, date, SIDE_ROWS))
      : null,
  };
}

async function resolveNames(guild, data) {
  const ids = new Set([
    ...data.members.map((row) => row.id),
    ...(data.voice ?? []).map((row) => row.id),
  ]);
  const names = new Map(
    await Promise.all(
      [...ids].map(async (id) => {
        const member =
          guild.members.cache.get(id) ??
          (await guild.members.fetch(id).catch(() => null));
        return /** @type {[string, string]} */ ([
          id,
          member?.displayName ?? UNKNOWN_MEMBER,
        ]);
      }),
    ),
  );
  const named = ({ id, value }) => ({ name: names.get(id), value });

  return {
    type: data.type,
    period: data.period,
    members: data.members.map(named),
    activity: data.activity,
    channels: data.channels.map(({ id, value }) => {
      const channel = guild.channels.cache.get(id);
      return { name: channel ? `#${channel.name}` : UNKNOWN_CHANNEL, value };
    }),
    voice: data.voice?.map(named) ?? null,
  };
}

function buildRow(entries, current, createId) {
  const buttons = entries.map(({ value, label }) =>
    new ButtonBuilder()
      .setCustomId(createId(value))
      .setLabel(label)
      .setStyle(value === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(value === current),
  );
  return new ActionRowBuilder().addComponents(buttons).toJSON();
}

function buildLeaderboardControls({ type, period, authorId, voiceEnabled }) {
  const rows = [
    buildRow(PERIODS, period, (value) =>
      buildCustomId("leaderboard", "period", type, value, authorId),
    ),
  ];
  if (voiceEnabled)
    rows.push(
      buildRow(TYPES, type, (value) =>
        buildCustomId("leaderboard", "type", value, period, authorId),
      ),
    );
  return rows;
}

async function buildLeaderboardMessage(
  db,
  guild,
  { type, period, authorId, date = new Date() },
) {
  const { voiceEnabled } = getSettings(db, guild.id);
  const data = getLeaderboardData(db, guild.id, {
    type,
    period,
    voiceEnabled,
    date,
  });
  const { renderLeaderboard } = require("./leaderboardCard");
  const image = await renderLeaderboard(await resolveNames(guild, data));

  return {
    files: [
      new AttachmentBuilder(image, {
        name: `leaderboard-${data.type}-${period}.png`,
      }),
    ],
    attachments: [],
    components: buildLeaderboardControls({
      type: data.type,
      period,
      authorId,
      voiceEnabled,
    }),
  };
}

module.exports = {
  isPeriod,
  isType,
  getLeaderboardData,
  resolveNames,
  buildLeaderboardControls,
  buildLeaderboardMessage,
};
