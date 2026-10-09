const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");
const { syncRules } = require("../utils/automodRules");
const {
  renderExemptionsView,
  renderLogsView,
  renderWordsModal,
  renderMentionLimitModal,
  renderEscalationModal,
  renderContestModal,
} = require("../utils/automodPanel");
const {
  mainView,
  parseWords,
  parseMentionLimit,
  parseEscalation,
  parseContest,
  getAutomodWords,
  setAutomodWords,
  getExemptions,
  setExemptions,
  getAutomodConfig,
  toggleObservation,
  syncErrorMessage,
} = require("../utils/automodConfig");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function applyRules(interaction, db) {
  try {
    await syncRules(
      interaction.guild,
      getAutomodConfig(db, interaction.guildId),
      `AutoMod de Tsuki · ${interaction.user.username}`,
    );
    return null;
  } catch (error) {
    return syncErrorMessage(error);
  }
}

async function finish(interaction, db, view) {
  await interaction.deferUpdate();
  const problem = await applyRules(interaction, db);
  await interaction.editReply(view());
  if (problem)
    await interaction.followUp({
      content: problem,
      flags: MessageFlags.Ephemeral,
    });
}

module.exports = defineComponent({
  id: "automod-config",

  async run(bot, interaction, [action], db) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
      return refuse(
        interaction,
        "Il faut la permission « Gérer le serveur » pour modifier ces réglages.",
      );

    const { guildId } = interaction;
    const author = interaction.user.id;
    const settings = getAutomodSettings(db, guildId);
    const main = () => mainView(interaction, db);

    if (interaction.isButton()) {
      if (action === "back") return interaction.update(main());
      if (action === "words")
        return interaction.showModal(
          renderWordsModal({ words: getAutomodWords(db, guildId) }),
        );
      if (action === "mention-limit")
        return interaction.showModal(renderMentionLimitModal({ settings }));
      if (action === "escalation")
        return interaction.showModal(renderEscalationModal({ settings }));
      if (action === "contest")
        return interaction.showModal(renderContestModal({ settings }));
      if (action === "exemptions")
        return interaction.update(
          renderExemptionsView({ exemptions: getExemptions(db, guildId) }),
        );
      if (action === "logs")
        return interaction.update(renderLogsView({ settings }));
      if (action === "spam-toggle") {
        updateAutomodSettings(
          db,
          guildId,
          { spamEnabled: !settings.spamEnabled },
          author,
        );
        return finish(interaction, db, main);
      }
      if (action === "mentions-toggle") {
        updateAutomodSettings(
          db,
          guildId,
          { mentionsEnabled: !settings.mentionsEnabled },
          author,
        );
        return finish(interaction, db, main);
      }
      if (action === "observation-toggle") {
        const result = toggleObservation(settings);
        if (result.error) return refuse(interaction, result.error);
        updateAutomodSettings(db, guildId, result, author);
        return finish(interaction, db, main);
      }
      if (action === "logs-clear") {
        const updated = updateAutomodSettings(
          db,
          guildId,
          { logChannel: null, observation: false },
          author,
        );
        return finish(interaction, db, () =>
          renderLogsView({ settings: updated }),
        );
      }
    }

    if (interaction.isRoleSelectMenu() && action === "exempt-roles") {
      setExemptions(db, guildId, "role", interaction.values, author);
      return finish(interaction, db, () =>
        renderExemptionsView({ exemptions: getExemptions(db, guildId) }),
      );
    }

    if (interaction.isChannelSelectMenu() && action === "exempt-channels") {
      setExemptions(db, guildId, "channel", interaction.values, author);
      return finish(interaction, db, () =>
        renderExemptionsView({ exemptions: getExemptions(db, guildId) }),
      );
    }

    if (interaction.isChannelSelectMenu() && action === "log-channel") {
      const updated = updateAutomodSettings(
        db,
        guildId,
        { logChannel: interaction.values[0] },
        author,
      );
      return finish(interaction, db, () =>
        renderLogsView({ settings: updated }),
      );
    }

    if (interaction.isModalSubmit() && interaction.isFromMessage()) {
      if (action === "save-words") {
        const parsed = parseWords(
          interaction.fields.getTextInputValue("words"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        setAutomodWords(db, guildId, parsed.words, author);
        return finish(interaction, db, main);
      }

      if (action === "save-mention-limit") {
        const parsed = parseMentionLimit(
          interaction.fields.getTextInputValue("limit"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        updateAutomodSettings(
          db,
          guildId,
          { mentionLimit: parsed.limit },
          author,
        );
        return finish(interaction, db, main);
      }

      if (action === "save-escalation") {
        const parsed = parseEscalation({
          warns: interaction.fields.getTextInputValue("warns"),
          minutes: interaction.fields.getTextInputValue("minutes"),
        });
        if (parsed.error) return refuse(interaction, parsed.error);
        updateAutomodSettings(db, guildId, parsed.escalation, author);
        return interaction.update(main());
      }

      if (action === "save-contest") {
        const parsed = parseContest(
          interaction.fields.getTextInputValue("hours"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        updateAutomodSettings(db, guildId, parsed, author);
        return interaction.update(main());
      }
    }
  },
});
