const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/core/defineComponent");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  ACTION_SETTINGS,
  parseRaidModal,
  parseTimeoutMinutes,
  signalChanges,
  toggleRaid,
} = require("../utils/raidConfig");
const { formatSimulation, simulateRaid } = require("../utils/raidSimulation");
const {
  CONFIG_ID,
  renderRaidResponseView,
  renderRaidView,
  renderThresholdsModal,
  renderTimeoutModal,
} = require("../utils/raidPanel");
const {
  getRaidSettings,
  updateRaidSettings,
} = require("../utils/raidSettings");

const ACTIONS = ["log", "timeout", "quarantine", "kick", "ban"];
const LOCKDOWNS = ["off", "invites", "verification"];

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = defineComponent({
  id: CONFIG_ID,

  async run(bot, interaction, [action], db) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
      return refuse(
        interaction,
        "Il faut la permission « Gérer le serveur » pour modifier ces réglages.",
      );

    const { guildId } = interaction;
    const author = interaction.user.id;
    const settings = getRaidSettings(db, guildId);
    const { logChannel } = getAutomodSettings(db, guildId);
    const update = (changes) =>
      updateRaidSettings(db, guildId, changes, author);
    const raidView = () =>
      renderRaidView({ settings: getRaidSettings(db, guildId), logChannel });
    const responseView = () =>
      renderRaidResponseView({ settings: getRaidSettings(db, guildId) });

    if (interaction.isButton()) {
      if (action === "raid") return interaction.update(raidView());
      if (action === "response") return interaction.update(responseView());
      if (action === "simulate")
        return interaction.reply({
          content: formatSimulation(simulateRaid(settings), settings),
          flags: MessageFlags.Ephemeral,
        });
      if (action === "thresholds")
        return interaction.showModal(renderThresholdsModal({ settings }));
      if (action === "timeout")
        return interaction.showModal(renderTimeoutModal({ settings }));
      if (action === "enabled-toggle") {
        const result = toggleRaid(settings, logChannel);
        if (result.error) return refuse(interaction, result.error);
        update(result);
        return interaction.update(raidView());
      }
      if (action === "observation-toggle") {
        update({ observation: !settings.observation });
        return interaction.update(raidView());
      }
      if (action === "scope-toggle") {
        update({ scope: settings.scope === "all" ? "suspect" : "all" });
        return interaction.update(raidView());
      }
    }

    if (interaction.isStringSelectMenu()) {
      const [value] = interaction.values;
      if (action === "signals") {
        update(signalChanges(interaction.values));
        return interaction.update(raidView());
      }
      const tier = action.replace(/-action$/, "");
      if (action.endsWith("-action") && tier in ACTION_SETTINGS) {
        if (!ACTIONS.includes(value))
          return refuse(interaction, "Cette action n'existe pas.");
        update({ [ACTION_SETTINGS[tier]]: value });
        return interaction.update(responseView());
      }
      if (action === "lockdown") {
        if (!LOCKDOWNS.includes(value))
          return refuse(interaction, "Ce verrouillage n'existe pas.");
        update({ lockdown: value });
        return interaction.update(responseView());
      }
    }

    if (interaction.isModalSubmit() && interaction.isFromMessage()) {
      const field = (name) => interaction.fields.getTextInputValue(name);
      if (action === "save-thresholds") {
        const parsed = parseRaidModal({
          window: field("window"),
          calm: field("calm"),
          thresholds: field("thresholds"),
          accountDays: field("accountDays"),
        });
        if (parsed.error) return refuse(interaction, parsed.error);
        update(parsed);
        return interaction.update(raidView());
      }
      if (action === "save-timeout") {
        const parsed = parseTimeoutMinutes(field("minutes"));
        if (parsed.error) return refuse(interaction, parsed.error);
        update(parsed);
        return interaction.update(responseView());
      }
    }
  },
});
