const { OverwriteType } = require("discord.js");

const MAX_WITNESSES = 3;
const NOT_A_ROOM =
  "Cette commande ne s'utilise que dans un salon de contestation.";
const WITNESS_PERMISSIONS = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
};

function witnessIds(overwrites, { memberId, botId }) {
  return [...overwrites]
    .filter(
      (entry) =>
        entry.type === OverwriteType.Member &&
        entry.id !== memberId &&
        entry.id !== botId,
    )
    .map((entry) => entry.id);
}

function witnessCheck({ action, room, target, witnesses }) {
  if (!room) return NOT_A_ROOM;
  if (target.bot) return "Un bot ne peut pas être témoin.";
  if (target.id === room.userId)
    return "Le membre contesté ne peut pas être témoin.";
  const known = witnesses.includes(target.id);
  if (action === "remove")
    return known ? null : `<@${target.id}> n'est pas témoin.`;
  if (known) return `<@${target.id}> est déjà témoin.`;
  if (witnesses.length >= MAX_WITNESSES)
    return `Il y a déjà ${MAX_WITNESSES} témoins, retires-en un d'abord.`;
  return null;
}

function witnessNotice(action, userId) {
  return action === "add"
    ? `<@${userId}> est ajouté(e) comme témoin de cette contestation.`
    : `<@${userId}> n'est plus témoin de cette contestation.`;
}

module.exports = {
  MAX_WITNESSES,
  NOT_A_ROOM,
  WITNESS_PERMISSIONS,
  witnessIds,
  witnessCheck,
  witnessNotice,
};
