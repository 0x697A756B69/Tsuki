const { MessageFlags } = require("discord.js");
const { getLogByContestChannel } = require("./automodLogs");
const {
  WITNESS_PERMISSIONS,
  witnessIds,
  witnessCheck,
  witnessNotice,
} = require("./automodWitness");

async function runWitness(action, bot, interaction, args, db) {
  const target = args.getUser("membre", true);
  const room = getLogByContestChannel(
    db,
    interaction.guildId,
    interaction.channelId,
  );
  const witnesses = witnessIds(
    interaction.channel.permissionOverwrites.cache.values(),
    {
      memberId: room?.userId,
      botId: bot.user.id,
    },
  );

  const error = witnessCheck({ action, room, target, witnesses });
  if (error)
    return interaction.reply({
      content: error,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });

  if (action === "add")
    await interaction.channel.permissionOverwrites.create(
      target.id,
      WITNESS_PERMISSIONS,
    );
  else await interaction.channel.permissionOverwrites.delete(target.id);

  return interaction.reply({
    content: witnessNotice(action, target.id),
    allowedMentions: { parse: [] },
  });
}

module.exports = { runWitness };
