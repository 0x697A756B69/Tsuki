const Discord = require("discord.js");
const { canModerate } = require("../utils/hierarchy");

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
      description: "La raison du bannissement.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    const user = args.getUser("membre");
    const member = args.getMember("membre");
    const reason = args.getString("raison") ?? "❌";
    const ephemeral = Discord.MessageFlags.Ephemeral;

    if (message.user.id === user.id)
      return message.reply({
        content: "Tu ne peux pas te bannir !",
        flags: ephemeral,
      });
    if (member && !canModerate(message.member, member))
      return message.reply({
        content: "Tu ne peux pas bannir ce membre !",
        flags: ephemeral,
      });
    if (member && !member.bannable)
      return message.reply({
        content: "Je ne peux pas bannir ce membre !",
        flags: ephemeral,
      });
    if (await message.guild.bans.fetch(user.id).catch(() => null))
      return message.reply({
        content: "Cet utilisateur est déjà banni(e) !",
        flags: ephemeral,
      });

    await user
      .send(
        `<:ban:1035246059695390800> Tu as été banni(e) de ${message.guild.name}.\n` +
          `> **Modérateur :** ${message.user.tag}\n` +
          `> **Raison :** \`${reason}\``,
      )
      .catch(() => {});

    await message.guild.bans.create(user.id, { reason });

    await message.reply(
      `<:ban:1035246059695390800> ${user} a été banni(e).\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\``,
    );
  },
};
