function voiceEligibleMembers(channelId, members, afkChannelId = null) {
  if (channelId === afkChannelId) return [];

  const humans = members.filter((member) => !member.bot);
  if (humans.length < 2) return [];

  return humans
    .filter((member) => !member.selfMute && !member.selfDeaf)
    .map((member) => member.id);
}

module.exports = { voiceEligibleMembers };
