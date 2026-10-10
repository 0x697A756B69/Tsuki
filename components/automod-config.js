const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("../utils/automodSettings");
const { syncRules } = require("../utils/automodRules");
const {
  renderWordsModal,
  renderMentionLimitModal,
  renderContestModal,
  renderReasonsModal,
  renderLadderModal,
  renderValidityModal,
} = require("../utils/automodPanel");
const {
  mainView,
  sectionView,
  parseWords,
  parseMentionLimit,
  parseContest,
  parseValidity,
  parseReasons,
  parseLadder,
  ladderLines,
  getAutomodWords,
  setAutomodWords,
  setExemptions,
  getAutomodConfig,
  toggleObservation,
  syncErrorMessage,
} = require("../utils/automodConfig");
const {
  getReasons,
  setReasons,
  resetReasons,
} = require("../utils/warnReasons");
const { getLadder, setLadder, resetLadder } = require("../utils/warnLadder");

const REASON_COLUMNS = {
  "reason-words": "reasonWords",
  "reason-spam": "reasonSpam",
  "reason-mentions": "reasonMentions",
};

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
    const home = () => mainView(interaction, db);
    const section = (name) => () => sectionView(name, interaction, db);

    if (interaction.isButton()) {
      if (action === "back") return interaction.update(home());
      if (action === "words")
        return interaction.showModal(
          renderWordsModal({ words: getAutomodWords(db, guildId) }),
        );
      if (action === "mention-limit")
        return interaction.showModal(renderMentionLimitModal({ settings }));
      if (action === "contest")
        return interaction.showModal(renderContestModal({ settings }));
      if (action === "validity")
        return interaction.showModal(renderValidityModal({ settings }));
      if (action === "reasons-edit")
        return interaction.showModal(
          renderReasonsModal({ reasons: getReasons(db, guildId) }),
        );
      if (action === "ladder-edit")
        return interaction.showModal(
          renderLadderModal({ lines: ladderLines(getLadder(db, guildId)) }),
        );
      if (action === "reasons-reset") {
        resetReasons(db, guildId);
        return interaction.update(section("reasons")());
      }
      if (action === "ladder-reset") {
        resetLadder(db, guildId);
        return interaction.update(section("ladder")());
      }
      if (action === "spam-toggle") {
        updateAutomodSettings(
          db,
          guildId,
          { spamEnabled: !settings.spamEnabled },
          author,
        );
        return finish(interaction, db, section("rules"));
      }
      if (action === "mentions-toggle") {
        updateAutomodSettings(
          db,
          guildId,
          { mentionsEnabled: !settings.mentionsEnabled },
          author,
        );
        return finish(interaction, db, section("rules"));
      }
      if (action === "observation-toggle") {
        const result = toggleObservation(settings);
        if (result.error) return refuse(interaction, result.error);
        updateAutomodSettings(db, guildId, result, author);
        return finish(interaction, db, section("observation"));
      }
      if (action === "justice-clear") {
        updateAutomodSettings(db, guildId, { justiceCategory: null }, author);
        return interaction.update(section("justice")());
      }
      if (action === "transcript-toggle") {
        updateAutomodSettings(
          db,
          guildId,
          { keepTranscript: !settings.keepTranscript },
          author,
        );
        return interaction.update(section("justice")());
      }
      if (action === "logs-clear") {
        updateAutomodSettings(
          db,
          guildId,
          { logChannel: null, observation: false },
          author,
        );
        return finish(interaction, db, section("logs"));
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (action === "goto") {
        const view = sectionView(interaction.values[0], interaction, db);
        if (!view) return refuse(interaction, "Ce réglage n'existe pas.");
        return interaction.update(view);
      }
      if (action in REASON_COLUMNS) {
        const [reason] = interaction.values;
        if (!getReasons(db, guildId).includes(reason))
          return refuse(interaction, "Cette raison n'existe plus.");
        updateAutomodSettings(
          db,
          guildId,
          { [REASON_COLUMNS[action]]: reason },
          author,
        );
        return interaction.update(section("reasons")());
      }
    }

    if (interaction.isRoleSelectMenu() && action === "exempt-roles") {
      setExemptions(db, guildId, "role", interaction.values, author);
      return finish(interaction, db, section("exemptions"));
    }

    if (interaction.isChannelSelectMenu() && action === "exempt-channels") {
      setExemptions(db, guildId, "channel", interaction.values, author);
      return finish(interaction, db, section("exemptions"));
    }

    if (interaction.isChannelSelectMenu() && action === "justice-category") {
      updateAutomodSettings(
        db,
        guildId,
        { justiceCategory: interaction.values[0] },
        author,
      );
      return interaction.update(section("justice")());
    }

    if (interaction.isChannelSelectMenu() && action === "log-channel") {
      updateAutomodSettings(
        db,
        guildId,
        { logChannel: interaction.values[0] },
        author,
      );
      return finish(interaction, db, section("logs"));
    }

    if (interaction.isModalSubmit() && interaction.isFromMessage()) {
      if (action === "save-words") {
        const parsed = parseWords(
          interaction.fields.getTextInputValue("words"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        setAutomodWords(db, guildId, parsed.words, author);
        return finish(interaction, db, section("rules"));
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
        return finish(interaction, db, section("rules"));
      }

      if (action === "save-contest") {
        const parsed = parseContest(
          interaction.fields.getTextInputValue("hours"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        updateAutomodSettings(db, guildId, parsed, author);
        return interaction.update(section("contest")());
      }

      if (action === "save-validity") {
        const parsed = parseValidity(
          interaction.fields.getTextInputValue("days"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        updateAutomodSettings(db, guildId, parsed, author);
        return interaction.update(section("validity")());
      }

      if (action === "save-reasons") {
        const parsed = parseReasons(
          interaction.fields.getTextInputValue("reasons"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        setReasons(db, guildId, parsed.reasons);
        return interaction.update(section("reasons")());
      }

      if (action === "save-ladder") {
        const parsed = parseLadder(
          interaction.fields.getTextInputValue("ladder"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        setLadder(db, guildId, parsed.ladder);
        return interaction.update(section("ladder")());
      }
    }
  },
});
