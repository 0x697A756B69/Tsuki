const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { getSettings, updateSettings } = require("../utils/settings");
const { getModifiers, setModifier } = require("../utils/modifiers");
const {
  MULTIPLIER_PRESETS,
  renderAnnounceView,
  renderBonusView,
  renderBonusTargetView,
  renderMessageModal,
  renderGainsModal,
} = require("../utils/xpPanel");
const { GAIN_FIELDS, mainView, parseGains } = require("../utils/xpConfig");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function bonusTarget(db, guildId, type, target) {
  const multiplier = getModifiers(db, guildId)[type].get(target) ?? 1;
  return renderBonusTargetView({ type, target, multiplier });
}

module.exports = defineComponent({
  id: "xp-config",

  async run(bot, interaction, [action, ...params], db) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
      return refuse(
        interaction,
        "Il faut la permission « Gérer le serveur » pour modifier ces réglages.",
      );

    const { guildId } = interaction;
    const author = interaction.user.id;
    const settings = getSettings(db, guildId);

    if (interaction.isButton()) {
      if (action === "announce")
        return interaction.update(renderAnnounceView({ settings }));
      if (action === "back")
        return interaction.update(mainView(interaction, db));
      if (action === "message")
        return interaction.showModal(renderMessageModal({ settings }));
      if (action === "gains")
        return interaction.showModal(renderGainsModal({ settings }));
      if (action === "bonus")
        return interaction.update(
          renderBonusView({ modifiers: getModifiers(db, guildId) }),
        );
    }

    if (interaction.isStringSelectMenu() && action === "mode") {
      const updated = updateSettings(
        db,
        guildId,
        { announceMode: interaction.values[0] },
        author,
      );
      return interaction.update(renderAnnounceView({ settings: updated }));
    }

    if (interaction.isChannelSelectMenu() && action === "channel") {
      const updated = updateSettings(
        db,
        guildId,
        { announceMode: "channel", announceChannel: interaction.values[0] },
        author,
      );
      return interaction.update(renderAnnounceView({ settings: updated }));
    }

    if (interaction.isRoleSelectMenu() && action === "bonus-role")
      return interaction.update(
        bonusTarget(db, guildId, "role", interaction.values[0]),
      );

    if (interaction.isChannelSelectMenu() && action === "bonus-channel")
      return interaction.update(
        bonusTarget(db, guildId, "channel", interaction.values[0]),
      );

    if (interaction.isStringSelectMenu() && action === "bonus-set") {
      const [type, target] = params;
      const multiplier = Number(interaction.values[0]);
      if (!MULTIPLIER_PRESETS.some((preset) => preset.value === multiplier))
        return refuse(interaction, "Cette valeur de bonus n'existe pas.");

      setModifier(db, guildId, type, target, multiplier);
      updateSettings(db, guildId, {}, author);
      return interaction.update(
        renderBonusView({ modifiers: getModifiers(db, guildId) }),
      );
    }

    if (interaction.isModalSubmit() && interaction.isFromMessage()) {
      if (action === "save-message") {
        const message = interaction.fields.getTextInputValue("message").trim();
        if (!message)
          return refuse(interaction, "Le message ne peut pas être vide.");
        updateSettings(db, guildId, { announceMessage: message }, author);
        return interaction.update(mainView(interaction, db));
      }

      if (action === "save-gains") {
        const values = Object.fromEntries(
          GAIN_FIELDS.map(({ field }) => [
            field,
            interaction.fields.getTextInputValue(field),
          ]),
        );
        const { gains, error } = parseGains(values);
        if (error) return refuse(interaction, error);
        updateSettings(db, guildId, gains, author);
        return interaction.update(mainView(interaction, db));
      }
    }
  },
});
