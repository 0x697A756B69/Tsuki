const { PermissionFlagsBits } = require("discord.js");

const WEIGHTS = [
  [PermissionFlagsBits.Administrator, 16],
  [PermissionFlagsBits.BanMembers, 8],
  [PermissionFlagsBits.KickMembers, 4],
  [PermissionFlagsBits.ModerateMembers, 2],
  [PermissionFlagsBits.ManageMessages, 1],
];

function power(member) {
  return WEIGHTS.reduce(
    (total, [flag, weight]) =>
      member.permissions.has(flag) ? total + weight : total,
    0,
  );
}

function compare(a, b) {
  if (a.id === a.guild.ownerId) return 1;
  if (b.id === b.guild.ownerId) return -1;
  return (
    power(a) - power(b) || a.roles.highest.comparePositionTo(b.roles.highest)
  );
}

function canModerate(moderator, target) {
  return compare(moderator, target) > 0;
}

module.exports = { canModerate };
