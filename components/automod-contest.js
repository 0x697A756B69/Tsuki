const defineComponent = require("../utils/defineComponent");
const { getAutomodSettings } = require("../utils/automodSettings");
const { getLog, markContested } = require("../utils/automodLogs");
const {
  CONTEST_ID,
  contestCheck,
  renderContestModal,
  parseReason,
  contestedPayload,
} = require("../utils/automodContest");

module.exports = defineComponent({
  id: CONTEST_ID,

  async run(bot, interaction, params, db) {
    const [action, guildId, channelId, messageId] = params;
    const ref = { guildId, channelId, messageId };

    const error = contestCheck({
      log: getLog(db, ref),
      settings: getAutomodSettings(db, guildId),
      userId: interaction.user.id,
    });
    if (error) return interaction.reply({ content: error });

    if (action === "ask" && interaction.isButton())
      return interaction.showModal(renderContestModal(ref));

    if (action !== "send" || !interaction.isModalSubmit()) return;

    const guild = await bot.guilds.fetch(guildId).catch(() => null);
    const channel = await guild?.channels.fetch(channelId).catch(() => null);
    const log = channel?.isTextBased()
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;
    if (!log)
      return interaction.reply({
        content:
          "Le journal n'est plus disponible, la contestation n'a pas pu être envoyée.",
      });

    if (!markContested(db, ref))
      return interaction.reply({ content: "Tu as déjà contesté ce blocage." });

    await log.edit(
      contestedPayload(log.components[0].toJSON(), {
        reason: parseReason(interaction.fields.getTextInputValue("reason")),
      }),
    );

    if (interaction.isFromMessage())
      return interaction.update({
        content: "Contestation envoyée. Les modérateurs vont l'examiner.",
        components: [],
      });
    return interaction.reply({ content: "Contestation envoyée." });
  },
});
