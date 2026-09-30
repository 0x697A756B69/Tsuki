const Discord = require("discord.js");

module.exports = {
  name: "kick",
  description: "Exclure un membre avec une raison optionnelle.",
  permission: Discord.PermissionFlagsBits.KickMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à exclure.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison de l'exclusion.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    let user = args.getUser("membre");
    if (!user)
      return message.reply({
        content: "Pas de membre à exclure !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    let member = message.guild.members.cache.get(user.id);
    if (!member)
      return message.reply({
        content: "Pas de membre à exclure !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    let reason = args.getString("raison");
    if (!reason) reason = "❌";

    if (message.user.id == user.id)
      return message.reply({
        content: "Tu ne peux pas t'exclure du serveur !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if ((await message.guild.fetchOwner()).id === user.id)
      return message.reply({
        content: "Tu ne peux pas exclure le propriétaire du serveur !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if (member && !member.kickable)
      return message.reply({
        content: "Je ne peux pas exclure ce membre !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if (
      member &&
      message.member.roles.highest.comparePositionTo(member.roles.highest) <= 0
    )
      return message.reply({
        content: "Tu ne peux pas exclure ce membre !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    try {
      await user.send(
        `Vous avez été exclu(e) de ${message.guild.name}.\n` +
          `> **Modérateur :** ${message.user.tag}\n` +
          `> **Raison :** \`${reason}\``,
      );
    } catch (err) {}

    await message.reply(
      `<:expulser:1035322289308307526> ${user} a été exclu(e).\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\``,
    );

    await member.kick(reason);
  },
};
