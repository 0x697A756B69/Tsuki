const Discord = require("discord.js");

module.exports = {
  name: "unban",
  description: "Débanner un utilisateur avec une raison optionnelle.",
  permission: Discord.PermissionFlagsBits.BanMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "utilisateur",
      description: "L'utilisateur à débannir.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison du débanissement",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    try {
      let user = args.getUser("utilisateur");
      if (!user)
        return message.reply({
          content: "Pas d'utilisateur !",
          flags: Discord.MessageFlags.Ephemeral,
        });

      let reason = args.getString("raison");
      if (!reason) reason = "❌";

      if (!(await message.guild.bans.fetch()).get(user.id))
        return message.reply({
          content: "Cet utilisateur n'est pas banni!",
          flags: Discord.MessageFlags.Ephemeral,
        });

      try {
        await user.send(
          `Vous avez été banni(e).\n` +
            `> **Modérateur :** ${message.user.tag}\n` +
            `> **Raison :** \`${reason}\``,
        );
      } catch (err) {}

      await message.reply(
        `<:ban:1035246059695390800> ${user} a été débanni(e)\n` +
          `> **Modérateur :**${message.user}\n` +
          `> **Raison :** \`${reason}\``,
      );

      await message.guild.members.unban(user, reason);
    } catch (err) {
      return message.reply({
        content: "Pas d'utilisateur!",
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  },
};
