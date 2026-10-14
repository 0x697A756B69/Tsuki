const { MessageFlags } = require("discord.js");
const defineComponent = require("../utils/core/defineComponent");
const {
  RAID_ACTION_ID,
  banGroupConfirmation,
  missingRaidPermission,
  parseRaidAction,
} = require("../utils/raidButtons");
const {
  banGroup,
  describeGroup,
  extendRaid,
  freeGroup,
  liftRaid,
} = require("../utils/raidControl");
const { getRaidSettings } = require("../utils/raidSettings");
const { KINDS, summarizeCauses } = require("../utils/core/failure");

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function failures(count, causes = []) {
  return count > 0
    ? ` ${plural(count, "échec")} (${summarizeCauses(causes) || KINDS.permissions}).`
    : "";
}

module.exports = defineComponent({
  id: RAID_ACTION_ID,

  async run(bot, interaction, params, db) {
    if (!interaction.isButton()) return;

    const parsed = parseRaidAction(params);
    if (!parsed) return refuse(interaction, "Ce bouton n'est plus actif.");
    const { action } = parsed;

    const missing = missingRaidPermission(
      action,
      interaction.memberPermissions,
    );
    if (missing) return refuse(interaction, missing);

    if (action === "bancancel")
      return interaction.update({
        content: "Bannissement annulé.",
        components: [],
      });

    const settings = getRaidSettings(db, interaction.guildId);
    const guild = interaction.guild;
    const now = Date.now();

    if (action === "free") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { freed, failed, causes } = await freeGroup(bot, guild, settings);
      return interaction.editReply({
        content: `${plural(freed.length, "membre")} libéré${freed.length > 1 ? "s" : ""}, plus aucune sanction automatique pour ce groupe.${failures(failed.length, causes)}`,
      });
    }

    if (action === "ban") {
      const group = describeGroup(bot, interaction.guildId, settings);
      if (group.users.length === 0)
        return refuse(interaction, "Il n'y a aucun membre à bannir.");
      return interaction.reply(banGroupConfirmation(group));
    }

    if (action === "banok") {
      await interaction.update({
        content: "Bannissement en cours…",
        components: [],
      });
      const { banned, failed, causes } = await banGroup(bot, guild, settings);
      return interaction.editReply({
        content: `${plural(banned.length, "membre")} banni${banned.length > 1 ? "s" : ""}.${failures(failed.length, causes)}`,
      });
    }

    if (action === "lift") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { freed, failed, causes, lockdown } = await liftRaid(
        bot,
        guild,
        settings,
        now,
      );
      const lines = [
        `Retour au calme : ${plural(freed.length, "membre")} libéré${freed.length > 1 ? "s" : ""}.${failures(failed.length, causes)}`,
      ];
      if (lockdown?.action === "release")
        lines.push(
          lockdown.ok
            ? "Verrouillage levé, état d'avant restauré."
            : "La levée du verrouillage a échoué, nouvelle tentative au prochain contrôle.",
        );
      return interaction.editReply({ content: lines.join("\n") });
    }

    const until = extendRaid(bot, interaction.guildId, settings, now);
    if (until === null)
      return refuse(interaction, "Aucun raid n'est en cours.");
    return interaction.reply({
      content: `Palier maintenu, le retour au calme ne commencera pas avant <t:${Math.floor(until / 1000)}:t>.`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
