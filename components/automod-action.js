const { MessageFlags } = require("discord.js");
const defineComponent = require("../utils/defineComponent");
const { canModerate } = require("../utils/hierarchy");
const {
  ACTION_ID,
  markResolved,
  getLog,
  getLogByContestChannel,
  setContestStatus,
  setJudged,
  clearContestChannel,
} = require("../utils/automodLogs");
const { NO_WARNING } = require("../utils/automodContest");
const {
  verdictPayload,
  archiveTranscript,
} = require("../utils/automodJustice");
const { getAutomodSettings } = require("../utils/automodSettings");
const {
  ACTIONS,
  parseAction,
  missingPermission,
  contestVerdict,
  banConfirmation,
} = require("../utils/automodActions");
const { issueWarning, retractWarning } = require("../utils/warnSanctions");

const MEMBER_ACTIONS = [
  "remove",
  "warn",
  "timeout",
  "accept",
  "refuse",
  "ban",
  "banok",
];

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

async function fetchLogMessage(guild, ref) {
  const channel = await guild.channels.fetch(ref.channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.messages.fetch(ref.messageId).catch(() => null);
}

async function perform(bot, interaction, db, action, args, member, ref) {
  const { guild, user } = interaction;
  if (action === "remove")
    await retractWarning({
      db,
      guild,
      userId: args[0],
      warningId: args[1],
      member,
      reason: `AutoMod : avertissement retiré par ${user.tag}`,
    });
  else if (action === "warn")
    await issueWarning({
      db,
      guild,
      user: await bot.users.fetch(args[0]),
      member,
      userId: args[0],
      id: await bot.utils.createId("WARN"),
      authorId: user.id,
      reason: "AutoMod : message détecté",
    });
  else if (action === "accept" || action === "refuse") {
    const accepted = action === "accept";
    const retracted =
      accepted && args[1] !== NO_WARNING
        ? await retractWarning({
            db,
            guild,
            userId: args[0],
            warningId: args[1],
            member,
            reason: `AutoMod : contestation acceptée par ${user.tag}`,
          })
        : { lifted: null };
    setContestStatus(db, ref, accepted ? "accepted" : "refused");
    setJudged(db, ref, user.id);
    const target = await bot.users.fetch(args[0]).catch(() => null);
    await target
      ?.send(contestVerdict(guild.name, accepted, retracted.lifted))
      .catch(() => {});
  } else if (action === "delete") {
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

    const room = getLogByContestChannel(
      db,
      interaction.guildId,
      interaction.channelId,
    );
    const ref = room?.ref ?? {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
    };

    if (action === "closeroom") {
      if (!room) return refuse(interaction, "Ce salon n'est plus actif.");
      if (room.judgedAt === null)
        return refuse(interaction, "La contestation n'est pas encore jugée.");
      await interaction.deferUpdate();
      clearContestChannel(db, room.ref);
      await archiveTranscript(
        interaction.guild,
        getAutomodSettings(db, interaction.guildId),
        interaction.channel,
      );
      return interaction.channel
        .delete(`AutoMod : salon clos par ${interaction.user.tag}`)
        .catch(() => {});
    }

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

    if (action === "accept" || action === "refuse") {
      const log = room ?? getLog(db, ref);
      if (log?.contestStatus !== "pending")
        return refuse(interaction, "Cette contestation a déjà été traitée.");
    }

    if (action === "ban")
      return interaction.reply(
        banConfirmation(args[0], interaction.message.id),
      );

    if (action === "banok") {
      const target = await interaction.channel.messages
        .fetch(args[1])
        .catch(() => null);
      if (!target || isHandled(target))
        return interaction.update({
          content: "Ce message a déjà été traité.",
          components: [],
        });
      await interaction.deferUpdate();
      const logMessage = room
        ? await fetchLogMessage(interaction.guild, ref)
        : target;
      if (logMessage && !isHandled(logMessage))
        await logMessage.edit(
          resolvedPayload(logMessage, interaction.user.id, action),
        );
      if (room) setJudged(db, ref, interaction.user.id);
      const banned = await perform(
        bot,
        interaction,
        db,
        action,
        args,
        member,
        ref,
      )
        .then(() => true)
        .catch(() => false);
      if (banned && room) {
        clearContestChannel(db, ref);
        await archiveTranscript(
          interaction.guild,
          getAutomodSettings(db, interaction.guildId),
          interaction.channel,
        );
        return interaction.channel
          .delete(`AutoMod : membre banni par ${interaction.user.tag}`)
          .catch(() => {});
      }
      return interaction.editReply({
        content: banned
          ? `<@${args[0]}> a été banni(e).`
          : "Le bannissement a échoué.",
        components: [],
        allowedMentions: { parse: [] },
      });
    }

    const settled = action === "accept" || action === "refuse";
    if (room && settled) {
      const logMessage = await fetchLogMessage(interaction.guild, ref);
      await interaction.update(
        verdictPayload(interaction.message.components[0].toJSON(), {
          moderatorId: interaction.user.id,
          label: ACTIONS[action].label,
          date: Date.now(),
        }),
      );
      if (logMessage)
        await logMessage.edit(
          resolvedPayload(logMessage, interaction.user.id, action),
        );
    } else
      await interaction.update(
        resolvedPayload(interaction.message, interaction.user.id, action),
      );
    await perform(bot, interaction, db, action, args, member, ref).catch(() =>
      interaction.followUp({
        content: "L'action a échoué, le message est classé quand même.",
        flags: MessageFlags.Ephemeral,
      }),
    );
  },
});
