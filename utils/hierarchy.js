const { PermissionFlagsBits } = require("discord.js");

const WEIGHTS = [
  { flag: PermissionFlagsBits.Administrator, weight: 16 },
  { flag: PermissionFlagsBits.BanMembers, weight: 8 },
  { flag: PermissionFlagsBits.KickMembers, weight: 4 },
  { flag: PermissionFlagsBits.ModerateMembers, weight: 2 },
  { flag: PermissionFlagsBits.ManageMessages, weight: 1 },
];

function power(member) {
  return WEIGHTS.reduce(
    (total, { flag, weight }) =>
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
