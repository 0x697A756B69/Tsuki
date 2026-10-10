const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { canModerate } = require("../utils/hierarchy");
const { getAutomodSettings } = require("../utils/automodSettings");
const { unwarnNotice, sendNotice } = require("../utils/moderationNotice");
const { sendRemovalLog } = require("../utils/warnRemovalLog");
const { listWarnings, retractWarning } = require("../utils/warnSanctions");
const {
  maskOf,
  pickWarnings,
  warnlistView,
  removalView,
  removedView,
  purgeView,
  purgedView,
} = require("../utils/warnlistPanel");

const ACTIONS = ["page", "select", "ok", "purge", "purgeok"];

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = defineComponent({
  id: "warnlist",

  async run(
    bot,
    interaction,
    [action, userId, page, authorId, mask, total],
    db,
  ) {
    if (interaction.user.id !== authorId)
      return refuse(
        interaction,
        "Seule la personne qui a lancé la commande peut utiliser ce panneau.",
      );
    if (!ACTIONS.includes(action) || !Number.isInteger(Number(page)))
      return refuse(interaction, "Ce bouton n'est plus actif.");

    const user = await bot.users.fetch(userId).catch(() => null);
    if (!user) return refuse(interaction, "Ce membre est introuvable.");

    const { guild, guildId } = interaction;
    const { warnValidDays, logChannel } = getAutomodSettings(db, guildId);
    const warnings = listWarnings(db, guildId, userId, warnValidDays);
    const pageNumber = Number(page);

    if (action === "page") {
      await interaction.deferUpdate();
      return interaction.editReply(
        warnlistView({ user, warnings, page: pageNumber, authorId }),
      );
    }

    if (action === "select") {
      if (!interaction.isStringSelectMenu())
        return refuse(interaction, "Ce bouton n'est plus actif.");
      const selectedMask = maskOf(interaction.values);
      const selected = pickWarnings(warnings, pageNumber, selectedMask);
      if (selected.length === 0)
        return refuse(interaction, "Ces avertissements n'existent plus.");
      await interaction.deferUpdate();
      return interaction.editReply(
        removalView({
          user,
          selected,
          page: pageNumber,
          mask: selectedMask,
          total: warnings.length,
          authorId,
        }),
      );
    }

    const purging = action === "purge" || action === "purgeok";
    if (
      purging &&
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    )
      return refuse(
        interaction,
        "Seul un administrateur peut purger les avertissements.",
      );

    if (action === "purge") {
      if (warnings.length === 0)
        return refuse(interaction, "Ces avertissements n'existent plus.");
      await interaction.deferUpdate();
      return interaction.editReply(
        purgeView({
          user,
          total: warnings.length,
          page: pageNumber,
          authorId,
        }),
      );
    }

    if (warnings.length !== Number(total))
      return refuse(
        interaction,
        "La liste a changé depuis la sélection. Rouvre-la et recommence.",
      );
    const selected = purging
      ? warnings
      : pickWarnings(warnings, pageNumber, Number(mask));
    if (selected.length === 0)
      return refuse(interaction, "Ces avertissements n'existent plus.");

    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && !canModerate(interaction.member, member))
      return refuse(interaction, "Tu ne peux pas modérer ce membre !");

    await interaction.deferUpdate();
    const lifted = [];
    const removedWarnings = [];
    for (const warning of selected) {
      const result = await retractWarning({
        db,
        guild,
        userId,
        warningId: warning.id,
        member,
        reason: `Avertissement retiré par ${interaction.user.tag}`,
      });
      if (!result.removed) continue;
      removedWarnings.push(warning);
      if (result.lifted) lifted.push(result.lifted);
    }
    const removed = removedWarnings.length;
    await sendRemovalLog(guild, logChannel, {
      moderatorId: interaction.user.id,
      userId,
      ids: removedWarnings.map((warning) => warning.id),
      purge: purging,
    });
    const delivered =
      removed > 0 &&
      (await sendNotice(
        user,
        unwarnNotice({
          guildName: guild.name,
          moderator: interaction.user.tag,
          count: removed,
          lifted,
        }),
      ));
    if (purging)
      return interaction.editReply(
        purgedView({
          user,
          purged: removedWarnings,
          lifted,
          delivered: removed === 0 || delivered,
          page: 0,
          authorId,
        }),
      );
    await interaction.editReply(
      removedView({
        user,
        count: removed,
        lifted,
        delivered: removed === 0 || delivered,
        page: pageNumber,
        authorId,
      }),
    );
  },
});
