const { getSettings } = require("./settings");
const { addXp } = require("./xp");
const { getModifiers, computeMultiplier } = require("./modifiers");
const { voiceEligibleMembers } = require("./voice");
const { announceLevelUp } = require("./announce");
const { updateRewardRoles } = require("./rewards");

async function rewardMember(bot, guild, settings, modifiers, channel, member) {
  const multiplier = computeMultiplier(modifiers, {
    channelId: channel.id,
    parentId: null,
    roleIds: [...member.roles.cache.keys()],
  });
  const gain = Math.round(settings.voiceXp * multiplier);
  if (gain <= 0) return;

  const { previousLevel, level } = addXp(bot.db, guild.id, member.id, gain);
  if (level === previousLevel) return;

  const { added } = await updateRewardRoles(bot.db, guild.id, member, level);
  if (level > previousLevel)
    await announceLevelUp({
      settings,
      member,
      level,
      channel: null,
      role: added,
    });
}

async function scanVoice(bot) {
  for (const guild of bot.guilds.cache.values()) {
    const settings = getSettings(bot.db, guild.id);
    if (!settings.voiceEnabled || settings.voiceXp === 0) continue;

    const modifiers = getModifiers(bot.db, guild.id);
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased()) continue;

      const members = [...channel.members.values()];
      const eligible = new Set(
        voiceEligibleMembers(
          channel.id,
          members.map((member) => ({
            id: member.id,
            bot: member.user.bot,
            selfMute: Boolean(member.voice.selfMute),
            selfDeaf: Boolean(member.voice.selfDeaf),
          })),
          guild.afkChannelId,
        ),
      );

      for (const member of members) {
        if (!eligible.has(member.id)) continue;
        try {
          await rewardMember(bot, guild, settings, modifiers, channel, member);
        } catch (err) {
          console.error("[voice scan]", err);
        }
      }
    }
  }
}

module.exports = { scanVoice };
