const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");

const COLOR = 0x7f77dd;

function removalLogMessage({ moderatorId, userId, ids, purge = false }) {
  const count = ids.length;
  const plural = count > 1 ? "s" : "";
  const title = purge
    ? `Avertissement${plural} purgé${plural}`
    : `Avertissement${plural} retiré${plural}`;
  const container = new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${title}`,
          `<@${moderatorId}> a ${purge ? "purgé" : "retiré"} ${count} avertissement${plural} de <@${userId}>.`,
          `-# ${ids.join(", ")} · modérateur ${moderatorId} · membre ${userId}`,
        ].join("\n"),
      ),
    );
  return {
    components: [container],
    flags: /** @type {MessageFlags.IsComponentsV2} */ (
      MessageFlags.IsComponentsV2
    ),
    allowedMentions: { parse: [] },
  };
}

async function sendRemovalLog(guild, logChannelId, data) {
  if (logChannelId === null || data.ids.length === 0) return false;
  const channel = guild.channels.cache.get(logChannelId);
  if (!channel?.isTextBased()) return false;
  return channel
    .send(removalLogMessage(data))
    .then(() => true)
    .catch(() => false);
}

module.exports = { removalLogMessage, sendRemovalLog };
