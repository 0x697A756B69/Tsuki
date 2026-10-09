const { MessageFlags } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { canModerate } = require("../utils/hierarchy");
const { ACTION_ID, markResolved } = require("../utils/automodLogs");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  ACTIONS,
  parseAction,
  missingPermission,
  removeWarning,
  addModeratorWarning,
  banConfirmation,
} = require("../utils/automodActions");

const MEMBER_ACTIONS = ["remove", "warn", "timeout", "ban", "banok"];

function refuse(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function resolvedPayload(message, moderatorId, action) {
  return markResolved(message.components[0].toJSON(), {
    moderatorId,
    label: ACTIONS[action].label,
    date: Date.now(),
  });
}

function isHandled(message) {
  return message.components[0]
    .toJSON()
    .components.every((part) => part.type !== 1);
}

async function perform(bot, interaction, db, action, args, member) {
  const { guild, user } = interaction;
  if (action === "remove") removeWarning(db, guild.id, args[0], args[1]);
  else if (action === "warn")
    addModeratorWarning(db, {
      id: await bot.utils.createId("WARN"),
      guildId: guild.id,
      userId: args[0],
      moderatorId: user.id,
    });
  else if (action === "delete") {
    const channel = await guild.channels.fetch(args[0]);
    await channel.messages.delete(args[1]);
  } else if (action === "timeout") {
    const { escalationMinutes } = getAutomodSettings(db, guild.id);
    await member.timeout(
      escalationMinutes * 60 * 1000,
      `AutoMod : sourdine par ${user.tag}`,
    );
  } else if (action === "banok")
    await guild.bans.create(args[0], {
      reason: `AutoMod : banni par ${user.tag}`,
    });
}

module.exports = defineComponent({
  id: ACTION_ID,

  async run(bot, interaction, params, db) {
    if (!interaction.isButton()) return;

    const parsed = parseAction(params);
    if (!parsed) return refuse(interaction, "Ce bouton n'est plus actif.");
    const { action, args } = parsed;

    const missing = missingPermission(action, interaction.memberPermissions);
    if (missing) return refuse(interaction, missing);

    if (action === "bancancel")
      return interaction.update({
        content: "Bannissement annulé.",
        components: [],
      });

    const member = MEMBER_ACTIONS.includes(action)
      ? await interaction.guild.members.fetch(args[0]).catch(() => null)
      : null;
    if (member && !canModerate(interaction.member, member))
      return refuse(interaction, "Tu ne peux pas modérer ce membre !");
    if (action === "timeout" && !member)
      return refuse(interaction, "Ce membre n'est pas sur le serveur !");
    if (action === "timeout" && !member.moderatable)
      return refuse(
        interaction,
        "Je ne peux pas mettre ce membre en sourdine !",
      );
    if ((action === "ban" || action === "banok") && member && !member.bannable)
      return refuse(interaction, "Je ne peux pas bannir ce membre !");

    if (action === "ban")
      return interaction.reply(
        banConfirmation(args[0], interaction.message.id),
      );

    if (action === "banok") {
      const log = await interaction.channel.messages
        .fetch(args[1])
        .catch(() => null);
      if (!log || isHandled(log))
        return interaction.update({
          content: "Ce message a déjà été traité.",
          components: [],
        });
      await interaction.deferUpdate();
      await log.edit(resolvedPayload(log, interaction.user.id, action));
      const done = await perform(bot, interaction, db, action, args, member)
        .then(() => `<@${args[0]}> a été banni(e).`)
        .catch(() => "Le bannissement a échoué.");
      return interaction.editReply({
        content: done,
        components: [],
        allowedMentions: { parse: [] },
      });
    }

    await interaction.update(
      resolvedPayload(interaction.message, interaction.user.id, action),
    );
    await perform(bot, interaction, db, action, args, member).catch(() =>
      interaction.followUp({
        content: "L'action a échoué, le message est classé quand même.",
        flags: MessageFlags.Ephemeral,
      }),
    );
  },
});
