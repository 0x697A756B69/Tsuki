const {
  getAutomodSettings,
  updateAutomodSettings,
} = require("./automodSettings");
const { oncePerGuild } = require("./oncePerGuild");

const ROLE_NAME = "Muet";
const REASON = "Tsuki : rôle muet";
const MUTE_DENIED = {
  SendMessages: false,
  SendMessagesInThreads: false,
  AddReactions: false,
  Speak: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
};

async function denyMuteRole(channel, roleId) {
  const overwrites = channel.permissionOverwrites;
  if (!overwrites || overwrites.cache?.has(roleId)) return false;
  try {
    await overwrites.edit(roleId, MUTE_DENIED, { reason: REASON });
    return true;
  } catch {
    return false;
  }
}

async function createMuteRole(db, guild) {
  const current = getAutomodSettings(db, guild.id).muteRole;
  if (current && guild.roles.cache.has(current)) return current;
  const role = await guild.roles
    .create({ name: ROLE_NAME, permissions: [], reason: REASON })
    .catch(() => null);
  if (!role) return null;
  updateAutomodSettings(db, guild.id, { muteRole: role.id }, "tsuki");
  for (const channel of guild.channels.cache.values())
    await denyMuteRole(channel, role.id);
  return role.id;
}

async function ensureMuteRole(db, guild, settings) {
  if (settings.muteRole && guild.roles.cache.has(settings.muteRole))
    return settings.muteRole;
  return oncePerGuild("mute", guild.id, () => createMuteRole(db, guild));
}

module.exports = { MUTE_DENIED, denyMuteRole, ensureMuteRole };
