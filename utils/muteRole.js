const { updateAutomodSettings } = require("./automodSettings");

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
  return overwrites.edit(roleId, MUTE_DENIED, { reason: REASON }).then(
    () => true,
    () => false,
  );
}

async function ensureMuteRole(db, guild, settings) {
  if (settings.muteRole && guild.roles.cache.has(settings.muteRole))
    return settings.muteRole;
  const role = await guild.roles
    .create({ name: ROLE_NAME, permissions: [], reason: REASON })
    .catch(() => null);
  if (!role) return null;
  for (const channel of guild.channels.cache.values())
    await denyMuteRole(channel, role.id);
  updateAutomodSettings(db, guild.id, { muteRole: role.id }, "tsuki");
  return role.id;
}

module.exports = { MUTE_DENIED, denyMuteRole, ensureMuteRole };
