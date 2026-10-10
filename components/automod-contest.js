const { ChannelType } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  getLog,
  markContested,
  setContestChannel,
} = require("../utils/automodLogs");
const {
  CONTEST_ID,
  contestCheck,
  contestClosed,
  renderContestModal,
  parseReason,
  contestedPayload,
  reviewTarget,
} = require("../utils/automodContest");
const {
  contestChannelName,
  moderatorRoleIds,
  contestOverwrites,
  canOpenContestChannel,
  sanctionLabel,
  logSummary,
  buildContestMessage,
} = require("../utils/automodJustice");
const { warningSanction } = require("../utils/warnSanctions");

async function openContestChannel(bot, guild, settings, details) {
  if (settings.justiceCategory === null) return null;
  const category = await guild.channels
    .fetch(settings.justiceCategory)
    .catch(() => null);
  if (!canOpenContestChannel(category, guild.members.me.permissions))
    return null;

  const member = await guild.members.fetch(details.userId).catch(() => null);
  const channel = await guild.channels
    .create({
      name: contestChannelName(member?.user.username),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: contestOverwrites({
        guildId: guild.id,
        memberId: details.userId,
        botId: bot.user.id,
        moderatorIds: moderatorRoleIds(guild.roles.cache.values(), guild.id),
      }),
      reason: "AutoMod : contestation",
    })
    .catch(() => null);
  if (channel === null) return null;

  const message = await channel
    .send(
      buildContestMessage({
        ...details,
        keepTranscript: settings.keepTranscript,
      }),
    )
    .catch(() => null);
  await message?.pin().catch(() => {});
  return channel;
}

module.exports = defineComponent({
  id: CONTEST_ID,

  async run(bot, interaction, params, db) {
    const [action, guildId, channelId, messageId] = params;
    const ref = { guildId, channelId, messageId };

    const log = getLog(db, ref);
    const settings = getAutomodSettings(db, guildId);

    const error = contestCheck({ log, settings, userId: interaction.user.id });
    if (error) {
      if (interaction.isButton() && contestClosed({ log, settings })) {
        await interaction.update({ components: [] });
        return interaction.followUp({ content: error });
      }
      return interaction.reply({ content: error });
    }

    if (action === "ask" && interaction.isButton())
      return interaction.showModal(renderContestModal(ref));

    if (action !== "send" || !interaction.isModalSubmit()) return;

    const guild = await bot.guilds.fetch(guildId).catch(() => null);
    const channel = await guild?.channels.fetch(channelId).catch(() => null);
    const logMessage = channel?.isTextBased()
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;
    if (!logMessage)
      return interaction.reply({
        content:
          "Le journal n'est plus disponible, la contestation n'a pas pu être envoyée.",
      });

    if (!markContested(db, ref))
      return interaction.reply({ content: "Tu as déjà contesté ce blocage." });

    const container = logMessage.components[0].toJSON();
    const reason = parseReason(interaction.fields.getTextInputValue("reason"));
    const { warningId } = reviewTarget(container);
    const { rule, blocked } = logSummary(container);
    const sanction = warningSanction(db, guildId, log.userId, warningId);

    const contestChannel = await openContestChannel(bot, guild, settings, {
      userId: log.userId,
      rule,
      warningId,
      sanction: sanctionLabel(sanction?.sanction, sanction?.timeoutUntil),
      reason,
      blocked,
      keepTranscript: settings.keepTranscript,
    });
    if (contestChannel !== null) setContestChannel(db, ref, contestChannel.id);

    await logMessage.edit(
      contestedPayload(container, {
        reason,
        channelId: contestChannel?.id ?? null,
      }),
    );

    const done =
      contestChannel === null
        ? "Contestation envoyée. Les modérateurs vont l'examiner."
        : `Contestation envoyée. Rendez-vous dans <#${contestChannel.id}>.`;
    if (interaction.isFromMessage())
      return interaction.update({ content: done, components: [] });
    return interaction.reply({ content: done });
  },
});
