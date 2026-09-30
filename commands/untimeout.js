const Discord = require("discord.js");
const ms = require("ms");

module.exports = {
  name: "untimeout",
  description: "untimeout un membre du server",
  permission: Discord.PermissionFlagsBits.ModerateMembers,
  dm: false,
  category: "Modération",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à untimeout",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison du untimeout",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    let user = args.getUser("membre");
    if (!user) return message.reply("Pas de membre à untimeout !");
    let member = message.guild.members.cache.get(user.id);
    if (!member) return message.reply("Pas de membre à untimeout !");
    let reason = args.getString("raison");
    if (!reason) reason = "Aucune raison fournie.";
    if (!member.moderatable)
      return message.reply("Je ne peux pas untimeout ce membre !");
    if (
      message.member.roles.highest.comparePositionTo(member.roles.highest) <= 0
    )
      return message.reply("Tu ne peut pas untimeout cette personne !");
    if (!member.isCommunicationDisabled())
      return message.reply("Ce membre n'est pas mute !");
    try {
      await user.send(
        `Vous n'êtes plus exclu(e) temporairement de ${message.guild.name}\n` +
          `> **Modérateur :** ${message.user}\n` +
          `> **Raison :** \`${reason}\``
      );
    } catch (err) {}
    await message.reply(
      `<:timeout:1035248378495381504> ${user} n'est plus exclu(e) temporairement.\n` +
        `> **Raison :** \`${reason}\``
    );
    await member.timeout(null, reason);
  },
};
