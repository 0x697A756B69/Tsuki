function formatAnnouncement(template, { member, level, role = null }) {
  const text = template
    .replaceAll("{membre}", String(member))
    .replaceAll("{niveau}", String(level))
    .replaceAll("{role}", role === null ? "" : `<@&${role}>`);
  return role === null ? text.replace(/[ \t]{2,}/g, " ").trim() : text;
}

async function announceLevelUp({ settings, member, level, channel, role }) {
  const content = formatAnnouncement(settings.announceMessage, {
    member,
    level,
    role,
  });
  const message = { content, allowedMentions: { parse: ["users"] } };

  if (settings.announceMode === "dm")
    return member.send(message).catch(() => {});

  if (settings.announceMode === "current") return channel.send(message);

  if (settings.announceMode === "channel") {
    const target = member.guild.channels.cache.get(settings.announceChannel);
    return (target?.isTextBased() ? target : channel).send(message);
  }
}

module.exports = { formatAnnouncement, announceLevelUp };
