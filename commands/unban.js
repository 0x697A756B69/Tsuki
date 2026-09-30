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
    const user = args.getUser("utilisateur");
    const reason = args.getString("raison") ?? "❌";

    if (!(await message.guild.bans.fetch(user.id).catch(() => null)))
      return message.reply({
        content: "Cet utilisateur n'est pas banni !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    await message.guild.members.unban(user, reason);

    await message.reply(
      `<:ban:1035246059695390800> ${user} a été débanni(e).\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\``,
    );
  },
};
