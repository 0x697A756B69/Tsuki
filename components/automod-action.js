const { MessageFlags } = require("discord.js");
const defineComponent = require("../utils/core/defineComponent");
const { canModerate } = require("../utils/moderation/hierarchy");
const {
  getLog,
  getLogByContestChannel,
  setContestStatus,
  setJudged,
  clearContestChannel,
} = require("../utils/automod/automodLogs");
const { ACTION_ID, markResolved } = require("../utils/automod/automodLogView");
const { extendRoom } = require("../utils/automod/automodRooms");
const { NO_WARNING } = require("../utils/automod/automodContest");
const {
  verdictPayload,
  archiveTranscript,
} = require("../utils/automod/automodJustice");
const { getAutomodSettings } = require("../utils/automod/automodSettings");
const {
  ACTIONS,
  parseAction,
  missingPermission,
  banConfirmation,
} = require("../utils/automod/automodActions");
const {
  applySanction,
  issueWarning,
  noteSanction,
  retractWarning,
} = require("../utils/moderation/warnSanctions");
const { ensureMuteRole } = require("../utils/moderation/muteRole");
const {
  verdictNotice,
  sendNotice,
} = require("../utils/moderation/moderationNotice");
const { describeFailure } = require("../utils/core/failure");

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

function usesMuteRole(settings, args) {
  return settings.muteType === "role" && args[1] !== undefined;
}

async function retract(db, interaction, action, args, member) {
  const { guild, user } = interaction;
  const none = { lifted: null };
  if (action === "remove")
    return retractWarning({
      db,
      guild,
      userId: args[0],
      warningId: args[1],
      member,
      reason: `AutoMod : avertissement retiré par ${user.tag}`,
    });
  if (action === "accept" && args[1] !== NO_WARNING)
    return retractWarning({
      db,
      guild,
      userId: args[0],
      warningId: args[1],
      member,
      reason: `AutoMod : contestation acceptée par ${user.tag}`,
    });
  return none;
}

async function perform(
  bot,
  interaction,
  db,
  action,
  args,
  member,
  ref,
  retracted = { lifted: null },
) {
  const { guild, user } = interaction;
  if (action === "warn")
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
    setContestStatus(db, ref, accepted ? "accepted" : "refused");
    setJudged(db, ref, user.id);
    const target = await bot.users.fetch(args[0]).catch(() => null);
    await sendNotice(
      target,
      verdictNotice({
        guildName: guild.name,
        accepted,
        lifted: retracted.lifted,
      }),
    );
  } else if (action === "delete") {
    const channel = await guild.channels.fetch(args[0]);
    await channel.messages.delete(args[1]);
  } else if (action === "timeout") {
    const settings = getAutomodSettings(db, guild.id);
    const reason = `AutoMod : sourdine par ${user.tag}`;
    if (usesMuteRole(settings, args)) {
      const muteRoleId = await ensureMuteRole(db, guild, settings);
      const applied =
        muteRoleId === null
          ? null
          : await applySanction({
              guild,
              member,
              userId: args[0],
              step: {
                sanction: "timeout",
                minutes: settings.escalationMinutes,
              },
              reason,
              now: Date.now(),
              muteRoleId,
            });
      if (applied === null) throw new Error("Missing Permissions");
      noteSanction(db, args[1], applied.sanction, applied.timeoutUntil);
    } else await member.timeout(settings.escalationMinutes * 60 * 1000, reason);
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
      const archived = await archiveTranscript(
        interaction.guild,
        getAutomodSettings(db, interaction.guildId),
        interaction.channel,
      );
      if (!archived)
        return interaction.followUp({
          content:
            "La transcription n'a pas pu être envoyée : le salon est conservé.",
          flags: MessageFlags.Ephemeral,
        });
      clearContestChannel(db, room.ref);
      return interaction.channel
        .delete(`AutoMod : salon clos par ${interaction.user.tag}`)
        .catch(() => {});
    }

    if (action === "extendroom") {
      if (!room) return refuse(interaction, "Ce salon n'est plus actif.");
      if (room.judgedAt === null)
        return refuse(interaction, "La contestation n'est pas encore jugée.");
      extendRoom(db, room.ref);
      return interaction.update({
        content: `Suppression repoussée de 24 h par <@${interaction.user.id}>.`,
        components: [],
        allowedMentions: { parse: [] },
      });
    }

    const member = MEMBER_ACTIONS.includes(action)
      ? await interaction.guild.members.fetch(args[0]).catch(() => null)
      : null;
    if (member && !canModerate(interaction.member, member))
      return refuse(interaction, "Tu ne peux pas modérer ce membre !");
    if (action === "timeout" && !member)
      return refuse(interaction, "Ce membre n'est pas sur le serveur !");
    if (
      action === "timeout" &&
      !(usesMuteRole(getAutomodSettings(db, interaction.guildId), args)
        ? member.manageable
        : member.moderatable)
    )
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
        const archived = await archiveTranscript(
          interaction.guild,
          getAutomodSettings(db, interaction.guildId),
          interaction.channel,
        );
        if (archived) {
          clearContestChannel(db, ref);
          return interaction.channel
            .delete(`AutoMod : membre banni par ${interaction.user.tag}`)
            .catch(() => {});
        }
      }
      return interaction.editReply({
        content: banned
          ? `<@${args[0]}> a été banni(e).`
          : "Le bannissement a échoué.",
        components: [],
        allowedMentions: { parse: [] },
      });
    }

    const retracted = await retract(db, interaction, action, args, member);
    if (retracted.failed)
      return refuse(
        interaction,
        `La sanction n'a pas pu être levée (${describeFailure(retracted.error)}) : l'avertissement est conservé. Réessaie depuis la liste des avertissements.`,
      );

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
    await perform(
      bot,
      interaction,
      db,
      action,
      args,
      member,
      ref,
      retracted,
    ).catch((err) =>
      interaction.followUp({
        content: `L'action a échoué (${describeFailure(err)}), le message est classé quand même.`,
        flags: MessageFlags.Ephemeral,
      }),
    );
  },
});
