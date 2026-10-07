const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { getSettings, updateSettings } = require("../utils/settings");
const { getModifiers, setModifier } = require("../utils/modifiers");
const {
  getRewards,
  setReward,
  removeReward,
  resyncRewardRoles,
} = require("../utils/rewards");
const {
  MULTIPLIER_PRESETS,
  renderAnnounceView,
  renderVoiceView,
  renderBonusView,
  renderBonusTargetView,
  renderRewardsView,
  renderRewardView,
  renderResyncConfirm,
  renderResyncProgress,
  renderResyncReport,
  renderMessageModal,
  renderGainsModal,
  renderVoiceModal,
  renderRewardModal,
} = require("../utils/xpPanel");
const {
  GAIN_FIELDS,
  mainView,
  parseGains,
  parseVoiceGain,
  parseRewardLevel,
  rewardRoleError,
} = require("../utils/xpConfig");

const resyncing = new Set();

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
      if (action === "voice")
        return interaction.update(renderVoiceView({ settings }));
      if (action === "voice-toggle") {
        const updated = updateSettings(
          db,
          guildId,
          { voiceEnabled: !settings.voiceEnabled },
          author,
        );
        return interaction.update(renderVoiceView({ settings: updated }));
      }
      if (action === "voice-gain")
        return interaction.showModal(renderVoiceModal({ settings }));
      if (action === "bonus")
        return interaction.update(
          renderBonusView({ modifiers: getModifiers(db, guildId) }),
        );
      if (action === "rewards")
        return interaction.update(
          renderRewardsView({ rewards: getRewards(db, guildId) }),
        );
      if (action === "resync") {
        if (getRewards(db, guildId).length === 0)
          return refuse(interaction, "Aucune récompense à resynchroniser.");
        return interaction.update(renderResyncConfirm());
      }
      if (action === "resync-confirm") {
        if (resyncing.has(guildId))
          return refuse(
            interaction,
            "Une resynchronisation est déjà en cours sur ce serveur.",
          );

        resyncing.add(guildId);
        try {
          await interaction.update(renderResyncProgress());
          const members = await interaction.guild.members.fetch();
          const report = await resyncRewardRoles(db, guildId, members);
          return await interaction.editReply(renderResyncReport(report));
        } finally {
          resyncing.delete(guildId);
        }
      }
      if (action === "reward-level") {
        const [role] = params;
        const current = getRewards(db, guildId).find((r) => r.role === role);
        return interaction.showModal(
          renderRewardModal({ role, level: current?.level ?? null }),
        );
      }
      if (action === "reward-remove") {
        removeReward(db, guildId, params[0]);
        updateSettings(db, guildId, {}, author);
        return interaction.update(
          renderRewardsView({ rewards: getRewards(db, guildId) }),
        );
      }
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

    if (interaction.isRoleSelectMenu() && action === "reward-role") {
      const [role] = interaction.values;
      const error = rewardRoleError(interaction.roles.get(role), guildId);
      if (error) return refuse(interaction, error);

      const current = getRewards(db, guildId).find((r) => r.role === role);
      if (current)
        return interaction.update(
          renderRewardView({ role, level: current.level }),
        );
      return interaction.showModal(renderRewardModal({ role, level: null }));
    }

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

      if (action === "save-reward") {
        const [role] = params;
        const error = rewardRoleError(
          interaction.guild.roles.cache.get(role),
          guildId,
        );
        if (error) return refuse(interaction, error);

        const parsed = parseRewardLevel(
          interaction.fields.getTextInputValue("level"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);

        setReward(db, guildId, parsed.level, role);
        updateSettings(db, guildId, {}, author);
        return interaction.update(
          renderRewardsView({ rewards: getRewards(db, guildId) }),
        );
      }

      if (action === "save-voice-gain") {
        const parsed = parseVoiceGain(
          interaction.fields.getTextInputValue("gain"),
        );
        if (parsed.error) return refuse(interaction, parsed.error);
        const updated = updateSettings(
          db,
          guildId,
          { voiceXp: parsed.gain },
          author,
        );
        return interaction.update(renderVoiceView({ settings: updated }));
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
