const Discord = require("discord.js");

module.exports = {
  name: "ban",
  description: "Bannir un utilisateur avec une raison.",
  permission: Discord.PermissionFlagsBits.BanMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "L'utilisateur à bannir.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison du bannisement.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    try {
      let user = await bot.users.fetch(args._hoistedOptions[0].value);
      if (!user)
        return message.reply({
          content: "Pas de membre à bannir !",
          ephemeral: true,
        });
      let member = message.guild.members.cache.get(user.id);

      let reason = args.getString("raison");
      if (!reason) reason = "❌";

      if (message.user.id === user.id)
        return message.reply("Essaie pas de te bannir!");
      if ((await message.guild.fetchOwner()).id === user.id)
        return message.reply({
          content: "Tu ne peux pas bannir le propriétaire du serveur.",
          ephemeral: true,
        });
      if (member && !member.bannable)
        return message.reply({
          content: "Je ne peux pas bannir ce membre.",
          ephemeral: true,
        });
      if (
        member &&
        message.member.roles.highest.comparePositionTo(member.roles.highest) <=
          0
      )
        return message.reply({
          content: "Tu ne peux pas bannir ce membre.",
          ephemeral: true,
        });
      if ((await message.guild.bans.fetch()).get(user.id))
        return message.reply({
          content: "Cet utilisateur est déjà banni(e).",
          ephemeral: true,
        });

      try {
        await user.send(
          `<:ban:1035246059695390800> Tu as été banni(e) de ${message.guild.name}.\n` +
            `> *Modérateur :** ${message.user.tag}\n` +
            `> **Raison :** \`${reason}\``
        );
      } catch (err) {}

      await message.reply(
        `<:ban:1035246059695390800> ${user} a été banni(e).\n` +
          `> **Modérateur :** ${message.user}\n` +
          `> **Raison :** \`${reason}\``
      );

      await message.guild.bans.create(user.id, { reason: reason });
    } catch (err) {
      return message.reply({
        content: "Pas de membre à bannir !",
        ephemeral: true,
      });
    }
  },
};
