function formatAnnouncement(template, { member, level }) {
  return template
    .replaceAll("{membre}", String(member))
    .replaceAll("{niveau}", String(level));
}

async function announceLevelUp({ settings, member, level, channel }) {
  const content = formatAnnouncement(settings.announceMessage, {
    member,
    level,
  });

  if (settings.announceMode === "dm")
    return member.send(content).catch(() => {});

  if (settings.announceMode === "current") return channel.send(content);

  if (settings.announceMode === "channel") {
    const target = member.guild.channels.cache.get(settings.announceChannel);
    return (target?.isTextBased() ? target : channel).send(content);
  }
}

module.exports = { formatAnnouncement, announceLevelUp };
